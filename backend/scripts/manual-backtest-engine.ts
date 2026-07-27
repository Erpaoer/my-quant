import { PrismaClient } from '@prisma/client'
import BacktestEngine from '../src/services/backtest/BacktestEngine'
import { Strategy } from '@prisma/client'

const prisma = new PrismaClient()

async function testBacktestEngine() {
  try {
    console.log('🧪 开始测试回测引擎...')

    // 1. 创建测试策略
    console.log('📝 创建测试策略...')
    const strategy = await prisma.strategy.create({
      data: {
        name: '测试回测策略',
        description: '用于测试回测引擎的简单移动平均线策略',
        code: `
function strategy(data, currentIndex, allData, params) {
  const { shortPeriod = 10, longPeriod = 30 } = params
  
  if (currentIndex < longPeriod) {
    return []
  }

  const currentData = data
  const shortMA = calculateMA(allData, currentIndex, shortPeriod)
  const longMA = calculateMA(allData, currentIndex, longPeriod)
  
  const prevShortMA = calculateMA(allData, currentIndex - 1, shortPeriod)
  const prevLongMA = calculateMA(allData, currentIndex - 1, longPeriod)

  const signals = []

  // 金叉买入信号
  if (shortMA > longMA && prevShortMA <= prevLongMA) {
    signals.push({
      type: 'buy',
      symbol: currentData.symbol,
      quantity: 0.1,
      price: currentData.close,
      reason: 'SMA Golden Cross'
    })
  }
  
  // 死叉卖出信号
  else if (shortMA < longMA && prevShortMA >= prevLongMA) {
    signals.push({
      type: 'sell',
      symbol: currentData.symbol,
      quantity: 1,
      price: currentData.close,
      reason: 'SMA Death Cross'
    })
  }

  return signals
}

function calculateMA(allData, currentIndex, period) {
  if (currentIndex < period - 1) return 0
  
  let sum = 0
  for (let i = currentIndex - period + 1; i <= currentIndex; i++) {
    sum += allData[i].close
  }
  
  return sum / period
}
        `,
        type: 'technical',
        parameters: {
          shortPeriod: 10,
          longPeriod: 30,
          strategyType: 'sma'
        },
        userId: 'test-user-id' // 需要替换为实际的用户ID
      }
    })

    console.log('✅ 测试策略创建成功:', strategy.id)

    // 2. 生成测试市场数据
    console.log('📊 生成测试市场数据...')
    const marketData = generateTestMarketData()
    
    // 保存市场数据到数据库
    await prisma.marketData.createMany({
      data: marketData,
      skipDuplicates: true
    })

    console.log('✅ 测试市场数据生成完成，共', marketData.length, '条记录')

    // 3. 创建回测引擎
    console.log('🔧 创建回测引擎...')
    const engine = new BacktestEngine({
      initialCapital: 10000,
      commission: 0.001,
      slippage: 0.001,
      leverage: 1,
      symbols: ['BTCUSDT'],
      timeframe: '1h',
      riskLimits: ['maxDrawdown'],
      outputOptions: ['trades', 'dailyReturns', 'drawdown']
    })

    // 4. 执行回测
    console.log('🚀 开始执行回测...')
    const result = await engine.run(
      strategy,
      marketData,
      (progress, step) => {
        console.log(`📈 进度: ${(progress * 100).toFixed(1)}% - ${step}`)
      },
      (level, message) => {
        console.log(`📝 ${level.toUpperCase()}: ${message}`)
      }
    )

    // 5. 输出结果
    console.log('\n🎉 回测完成！')
    console.log('=== 回测结果 ===')
    console.log(`初始资金: $${result.initialCapital.toFixed(2)}`)
    console.log(`最终资金: $${result.finalCapital.toFixed(2)}`)
    console.log(`总收益率: ${(result.totalReturn * 100).toFixed(2)}%`)
    console.log(`年化收益率: ${(result.annualizedReturn * 100).toFixed(2)}%`)
    console.log(`夏普比率: ${result.sharpeRatio.toFixed(2)}`)
    console.log(`最大回撤: ${(result.maxDrawdown * 100).toFixed(2)}%`)
    console.log(`胜率: ${(result.winRate * 100).toFixed(2)}%`)
    console.log(`盈亏比: ${result.profitFactor.toFixed(2)}`)
    console.log(`总交易次数: ${result.totalTrades}`)
    console.log(`总手续费: $${result.totalCommission.toFixed(2)}`)
    console.log(`总滑点: $${result.totalSlippage.toFixed(2)}`)

    // 6. 清理测试数据
    console.log('\n🧹 清理测试数据...')
    await prisma.marketData.deleteMany({
      where: {
        symbol: 'BTCUSDT',
        timestamp: {
          gte: new Date('2024-01-01'),
          lte: new Date('2024-01-31')
        }
      }
    })
    
    await prisma.strategy.delete({
      where: { id: strategy.id }
    })

    console.log('✅ 测试完成，数据已清理')

  } catch (error) {
    console.error('❌ 测试失败:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// 生成测试市场数据
function generateTestMarketData() {
  const data = []
  const startDate = new Date('2024-01-01')
  const endDate = new Date('2024-01-31')
  
  let currentPrice = 45000
  let current = new Date(startDate)
  
  while (current <= endDate) {
    // 生成价格波动
    const volatility = 0.02 // 2% 日波动率
    const change = (Math.random() - 0.5) * volatility
    currentPrice = Math.max(currentPrice * (1 + change), 10000)
    
    const high = currentPrice * (1 + Math.random() * 0.01)
    const low = currentPrice * (1 - Math.random() * 0.01)
    const open = currentPrice
    const close = currentPrice * (1 + (Math.random() - 0.5) * 0.005)
    
    data.push({
      symbol: 'BTCUSDT',
      timestamp: new Date(current),
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000000,
      interval: '1h',
      source: 'test'
    })
    
    current.setHours(current.getHours() + 1)
  }
  
  return data
}

// 运行测试
if (require.main === module) {
  testBacktestEngine()
    .then(() => {
      console.log('\n🎊 所有测试通过！')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n💥 测试失败:', error)
      process.exit(1)
    })
}

export default testBacktestEngine
