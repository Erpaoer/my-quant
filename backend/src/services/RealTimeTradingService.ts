import { exchangeService } from '../exchanges/ExchangeService';
import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

export interface TradingConfig {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  riskPerTrade: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxLeverage: number;
  cooldownPeriod: number;
}

export interface TradeSignal {
  symbol: string;
  type: 'buy' | 'sell';
  amount: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  strategy: string;
  confidence: number;
  metadata?: any;
}

export interface RiskAssessment {
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
  adjustedAmount?: number;
  adjustedStopLoss?: number;
  adjustedTakeProfit?: number;
}

export class RealTimeTradingService extends EventEmitter {
  private tradingConfigs: Map<string, TradingConfig> = new Map();
  private activePositions: Map<string, any> = new Map();
  private dailyPnL: Map<string, number> = new Map();
  private tradeHistory: Map<string, any[]> = new Map();
  private riskManager: RiskManager;

  constructor() {
    super();
    this.riskManager = new RiskManager();
    this.initializeEventListeners();
    this.loadTradingConfigs();
  }

  private initializeEventListeners(): void {
    // 监听交易所事件
    exchangeService.onEvent('order_update', (event) => {
      this.handleOrderUpdate(event);
    });

    exchangeService.onEvent('position_update', (event) => {
      this.handlePositionUpdate(event);
    });

    exchangeService.onEvent('balance_update', (event) => {
      this.handleBalanceUpdate(event);
    });
  }

  private async loadTradingConfigs(): Promise<void> {
    // TradingConfig is currently runtime-only; the Prisma schema has no
    // persisted trading configuration model.
  }

  async executeTrade(accountId: string, signal: TradeSignal): Promise<any> {
    try {
      // 获取账户信息
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: { user: true }
      });

      if (!account) {
        throw new Error('Account not found');
      }

      // 风险评估
      const riskAssessment = await this.riskManager.assessTrade(accountId, signal);
      if (!riskAssessment.passed) {
        throw new Error(`Risk assessment failed: ${riskAssessment.reasons.join(', ')}`);
      }

      // 应用风险调整
      const adjustedSignal = this.applyRiskAdjustments(signal, riskAssessment);

      // 检查冷却期
      if (await this.isInCooldown(accountId, signal.symbol)) {
        throw new Error('Trade in cooldown period');
      }

      // 执行交易
      const order = await exchangeService.placeOrder(account.exchange, {
        symbol: adjustedSignal.symbol,
        type: adjustedSignal.price ? 'limit' : 'market',
        side: adjustedSignal.type,
        amount: adjustedSignal.amount,
        price: adjustedSignal.price,
        params: {
          stopLoss: adjustedSignal.stopLoss,
          takeProfit: adjustedSignal.takeProfit
        }
      });

      // 记录交易
      await this.recordTrade(accountId, {
        ...order,
        strategy: adjustedSignal.strategy,
        confidence: adjustedSignal.confidence,
        riskAssessment,
        signal: adjustedSignal
      });

      // 更新冷却期
      await this.updateCooldown(accountId, signal.symbol);

      // 发送交易事件
      this.emit('trade_executed', {
        accountId,
        order,
        signal: adjustedSignal,
        timestamp: Date.now()
      });

      return order;
    } catch (error) {
      console.error('Error executing trade:', error);
      this.emit('trade_failed', {
        accountId,
        signal,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
      throw error;
    }
  }

  async closePosition(accountId: string, symbol: string, reason: string): Promise<any> {
    try {
      const positions = await exchangeService.getPositions(accountId);
      const position = positions.find(p => p.symbol === symbol);

      if (!position || position.size === 0) {
        throw new Error('No position found for symbol');
      }

      const closeOrder = await exchangeService.placeOrder(accountId, {
        symbol,
        type: 'market',
        side: position.side === 'long' ? 'sell' : 'buy',
        amount: position.size
      });

      // 记录平仓
      await this.recordPositionClose(accountId, symbol, closeOrder, reason);

      this.emit('position_closed', {
        accountId,
        symbol,
        order: closeOrder,
        reason,
        timestamp: Date.now()
      });

      return closeOrder;
    } catch (error) {
      console.error('Error closing position:', error);
      throw error;
    }
  }

  async updateStopLoss(accountId: string, symbol: string, newStopLoss: number): Promise<boolean> {
    try {
      // 这里需要根据交易所的具体API实现
      // 某些交易所支持修改止损单，某些需要取消重新下单
      this.emit('stop_loss_updated', {
        accountId,
        symbol,
        newStopLoss,
        timestamp: Date.now()
      });
      return true;
    } catch (error) {
      console.error('Error updating stop loss:', error);
      return false;
    }
  }

  async getTradingStats(accountId: string): Promise<any> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [dailyTrades, dailyPnL, positions, balance] = await Promise.all([
        prisma.trade.count({
          where: {
            accountId,
            timestamp: { gte: today }
          }
        }),
        this.calculateDailyPnL(accountId),
        exchangeService.getPositions(accountId),
        exchangeService.getBalance(accountId)
      ]);

      return {
        dailyTrades,
        dailyPnL,
        openPositions: positions.length,
        totalBalance: balance.reduce((sum, b) => sum + b.total, 0),
        availableBalance: balance.reduce((sum, b) => sum + b.free, 0),
        lastUpdate: Date.now()
      };
    } catch (error) {
      console.error('Error getting trading stats:', error);
      throw error;
    }
  }

  private async handleOrderUpdate(event: any): Promise<void> {
    try {
      const { exchange, data } = event;
      
      // 更新数据库中的订单状态
      const account = await prisma.account.findFirst({
        where: { exchange }
      });
      if (!account) return;

      await prisma.order.updateMany({
        where: {
          accountId: account.id,
          exchangeId: data.id
        },
        data: {
          status: data.status,
          filledQuantity: data.filled ?? 0,
          averagePrice: data.average,
          commission: data.fee,
          updateTime: new Date()
        }
      });

      // 如果订单完成，创建交易记录
      if (data.status === 'closed' || data.status === 'filled') {
        await this.createTradeRecord(account.id, data);
      }

      this.emit('order_updated', event);
    } catch (error) {
      console.error('Error handling order update:', error);
    }
  }

  private async handlePositionUpdate(event: any): Promise<void> {
    try {
      const { exchange, data } = event;
      
      // 更新数据库中的持仓
      const account = await prisma.account.findFirst({
        where: { exchange }
      });
      if (!account) return;

      const existing = await prisma.position.findFirst({
        where: { accountId: account.id, symbol: data.symbol, status: 'open' }
      });
      if (existing) {
        await prisma.position.update({
          where: { id: existing.id },
          data: {
          side: data.side,
          size: data.size,
          entryPrice: data.entryPrice,
          markPrice: data.markPrice,
          pnl: data.pnl,
          roe: data.roe,
          leverage: data.leverage,
          margin: data.margin,
          liquidationPrice: data.liquidationPrice,
          updatedAt: new Date()
          }
        });
      } else {
        await prisma.position.create({
          data: {
          accountId: account.id,
          symbol: data.symbol,
          side: data.side,
          size: data.size,
          entryPrice: data.entryPrice,
          markPrice: data.markPrice,
          pnl: data.pnl,
          roe: data.roe,
          leverage: data.leverage,
          margin: data.margin,
          liquidationPrice: data.liquidationPrice,
          status: 'open'
          }
        });
      }

      this.emit('position_updated', event);
    } catch (error) {
      console.error('Error handling position update:', error);
    }
  }

  private async handleBalanceUpdate(event: any): Promise<void> {
    try {
      const { exchange, data } = event;
      
      // 更新数据库中的余额
      const account = await prisma.account.findFirst({
        where: { exchange }
      });
      if (!account) return;

      for (const balance of data) {
        const existing = await prisma.balance.findFirst({
          where: { accountId: account.id, asset: balance.asset }
        });
        if (existing) {
          await prisma.balance.update({
            where: { id: existing.id },
            data: {
            free: balance.free,
            locked: balance.used,
            total: balance.total,
            lastUpdated: new Date()
            }
          });
        } else {
          await prisma.balance.create({
            data: {
            accountId: account.id,
            asset: balance.asset,
            free: balance.free,
            locked: balance.used,
            total: balance.total
            }
          });
        }
      }

      this.emit('balance_updated', event);
    } catch (error) {
      console.error('Error handling balance update:', error);
    }
  }

  private applyRiskAdjustments(signal: TradeSignal, assessment: RiskAssessment): TradeSignal {
    const adjustedSignal = { ...signal };

    if (assessment.adjustedAmount) {
      adjustedSignal.amount = assessment.adjustedAmount;
    }

    if (assessment.adjustedStopLoss) {
      adjustedSignal.stopLoss = assessment.adjustedStopLoss;
    }

    if (assessment.adjustedTakeProfit) {
      adjustedSignal.takeProfit = assessment.adjustedTakeProfit;
    }

    return adjustedSignal;
  }

  private async isInCooldown(accountId: string, symbol: string): Promise<boolean> {
    try {
      const lastTrade = await prisma.trade.findFirst({
        where: {
          accountId,
          symbol,
          status: 'completed'
        },
        orderBy: { timestamp: 'desc' }
      });

      if (!lastTrade || !lastTrade.timestamp) return false;

      const config = this.tradingConfigs.get(accountId);
      if (!config) return false;

      const cooldownMs = config.cooldownPeriod * 60 * 1000;
      const timeSinceLastTrade = Date.now() - new Date(lastTrade.timestamp).getTime();

      return timeSinceLastTrade < cooldownMs;
    } catch (error) {
      console.error('Error checking cooldown:', error);
      return false;
    }
  }

  private async updateCooldown(accountId: string, symbol: string): Promise<void> {
    // 冷却期逻辑已在 isInCooldown 中处理
  }

  private async recordTrade(accountId: string, tradeData: any): Promise<void> {
    try {
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      if (!account) return;
      const strategy = await this.getOrCreateManualStrategy(account.userId);

      await prisma.trade.create({
        data: {
          accountId,
          strategyId: strategy.id,
          userId: account.userId,
          symbol: tradeData.symbol,
          type: tradeData.type,
          side: tradeData.side === 'buy' ? 'long' : 'short',
          quantity: Number(tradeData.amount ?? 0),
          price: Number(tradeData.average ?? tradeData.price ?? 0),
          status: tradeData.status,
          timestamp: new Date(),
          notes: JSON.stringify({
            strategy: tradeData.strategy,
            confidence: tradeData.confidence,
            riskAssessment: tradeData.riskAssessment,
            signal: tradeData.signal,
            exchangeOrderId: tradeData.id
          })
        }
      });
    } catch (error) {
      console.error('Error recording trade:', error);
    }
  }

  private async recordPositionClose(accountId: string, symbol: string, order: any, reason: string): Promise<void> {
    try {
      await prisma.position.updateMany({
        where: {
          accountId,
          symbol,
          status: 'open'
        },
        data: {
          status: 'closed',
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error recording position close:', error);
    }
  }

  private async createTradeRecord(accountId: string, order: any): Promise<void> {
    try {
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      if (!account) return;
      const strategy = await this.getOrCreateManualStrategy(account.userId);

      await prisma.trade.create({
        data: {
          accountId,
          strategyId: strategy.id,
          userId: account.userId,
          symbol: order.symbol,
          type: order.type,
          side: order.side === 'buy' ? 'long' : 'short',
          quantity: Number(order.filled ?? order.amount ?? 0),
          price: Number(order.average ?? order.price ?? 0),
          status: 'completed',
          commission: order.fee,
          timestamp: new Date(),
          notes: JSON.stringify({
            exchangeOrderId: order.id,
            completedAt: new Date()
          })
        }
      });
    } catch (error) {
      console.error('Error creating trade record:', error);
    }
  }

  private async calculateDailyPnL(accountId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const trades = await prisma.trade.findMany({
        where: {
          accountId,
          timestamp: { gte: today },
          status: 'completed'
        }
      });

      return trades.reduce((pnl, trade) => {
        return pnl + (trade.pnl ?? 0);
      }, 0);
    } catch (error) {
      console.error('Error calculating daily PnL:', error);
      return 0;
    }
  }

  private async getOrCreateManualStrategy(userId: string) {
    const existing = await prisma.strategy.findFirst({
      where: { userId, name: 'Manual Trading' }
    });
    if (existing) return existing;

    return prisma.strategy.create({
      data: {
        name: 'Manual Trading',
        description: 'Trades created by the real-time trading service',
        code: '// Runtime-managed manual trading strategy',
        type: 'manual',
        status: 'active',
        userId
      }
    });
  }
}

class RiskManager {
  async assessTrade(accountId: string, signal: TradeSignal): Promise<RiskAssessment> {
    const reasons: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    try {
      // 获取账户配置
      const config = await this.getTradingConfig(accountId);
      
      // 检查仓位大小
      if (signal.amount > config.maxPositionSize) {
        reasons.push('Position size exceeds maximum');
        riskLevel = 'high';
      }

      // 检查日亏损限额
      const dailyPnL = await this.getDailyPnL(accountId);
      if (dailyPnL < -config.maxDailyLoss) {
        reasons.push('Daily loss limit exceeded');
        riskLevel = 'high';
      }

      // 检查最大回撤
      const maxDrawdown = await this.calculateMaxDrawdown(accountId);
      if (maxDrawdown > config.maxDrawdown) {
        reasons.push('Maximum drawdown exceeded');
        riskLevel = 'high';
      }

      // 检查杠杆限制
      const currentLeverage = await this.getCurrentLeverage(accountId);
      if (currentLeverage > config.maxLeverage) {
        reasons.push('Leverage limit exceeded');
        riskLevel = 'high';
      }

      // 风险调整
      const adjustedAmount = Math.min(signal.amount, config.maxPositionSize);
      const adjustedStopLoss = this.calculateStopLoss(signal, config);
      const adjustedTakeProfit = this.calculateTakeProfit(signal, config);

      return {
        passed: reasons.length === 0,
        riskLevel,
        reasons,
        adjustedAmount,
        adjustedStopLoss,
        adjustedTakeProfit
      };
    } catch (error) {
      console.error('Error in risk assessment:', error);
      return {
        passed: false,
        riskLevel: 'high',
        reasons: ['Risk assessment failed']
      };
    }
  }

  private async getTradingConfig(accountId: string): Promise<TradingConfig> {
    // 默认配置
    const defaultConfig: TradingConfig = {
      maxPositionSize: 1000,
      maxDailyLoss: 100,
      maxDrawdown: 0.1,
      riskPerTrade: 0.02,
      stopLossPercent: 0.02,
      takeProfitPercent: 0.04,
      maxLeverage: 3,
      cooldownPeriod: 5
    };

    return defaultConfig;
  }

  private async getDailyPnL(accountId: string): Promise<number> {
    // 实现日盈亏计算
    return 0;
  }

  private async calculateMaxDrawdown(accountId: string): Promise<number> {
    // 实现最大回撤计算
    return 0;
  }

  private async getCurrentLeverage(accountId: string): Promise<number> {
    // 实现当前杠杆计算
    return 0;
  }

  private calculateStopLoss(signal: TradeSignal, config: TradingConfig): number {
    if (signal.stopLoss) return signal.stopLoss;
    if (!signal.price) return 0;
    
    if (signal.type === 'buy') {
      return signal.price * (1 - config.stopLossPercent);
    } else {
      return signal.price * (1 + config.stopLossPercent);
    }
  }

  private calculateTakeProfit(signal: TradeSignal, config: TradingConfig): number {
    if (signal.takeProfit) return signal.takeProfit;
    if (!signal.price) return 0;
    
    if (signal.type === 'buy') {
      return signal.price * (1 + config.takeProfitPercent);
    } else {
      return signal.price * (1 - config.takeProfitPercent);
    }
  }
}

export const realTimeTradingService = new RealTimeTradingService();
