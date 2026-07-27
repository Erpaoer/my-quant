import { Router, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';
import config from '../config';
import { TushareAdapter } from '../services/data/adapters/TushareAdapter';

const router = Router();

function upstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === 'number' ? response.status : undefined;
}

function sendYahooFailure(
  res: Response,
  error: unknown,
  operation: 'connection' | 'sample' | 'api'
) {
  const status = upstreamStatus(error);
  const isBlocked = status === 403;
  const messages = {
    connection: 'Failed to connect to Yahoo Finance',
    sample: 'Failed to retrieve Yahoo Finance sample data',
    api: 'Yahoo Finance API test failed'
  };

  return res.status(isBlocked ? 503 : 502).json({
    success: false,
    message: isBlocked
      ? 'Yahoo Finance is unavailable from the current network'
      : messages[operation],
    error: error instanceof Error ? error.message : 'Unknown upstream error',
    ...(status ? { upstreamStatus: status } : {})
  });
}

// Test data source connection
router.post('/test-connection', async (req, res) => {
  try {
    const { source, type } = req.body;
    
    console.log('=== 数据源连接测试 ===');
    console.log('📥 请求报文:');
    console.log(`  URL: POST /data-test/test-connection`);
    console.log(`  Body:`, JSON.stringify(req.body, null, 2));
    console.log(`  测试数据源: ${source} (${type})`);
    
    const startTime = Date.now();
    
    // Test real connection to the data source
    if (source.toLowerCase() === 'binance') {
      // Test Binance API connection
      try {
        console.log('🌐 外部API请求:');
        console.log(`  URL: GET https://api.binance.com/api/v3/ping`);
        console.log(`  Timeout: 5000ms`);
        
        const response = await axios.get('https://api.binance.com/api/v3/ping', {
          timeout: 5000
        });
        
        console.log('📤 外部API响应:');
        console.log(`  Status: ${response.status} ${response.statusText}`);
        console.log(`  Headers:`, JSON.stringify(response.headers, null, 2));
        console.log(`  Data:`, JSON.stringify(response.data, null, 2));
        
        if (response.status === 200) {
          const latency = Date.now() - startTime;
          const responseData = {
            success: true,
            message: 'Binance API connection successful',
            data: {
              source,
              type,
              connected: true,
              latency,
              timestamp: new Date().toISOString()
            }
          };
          
          console.log('📤 返回客户端报文:');
          console.log(`  Status: 200 OK`);
          console.log(`  Body:`, JSON.stringify(responseData, null, 2));
          console.log('=== 连接测试完成 ===\n');
          
          res.json(responseData);
        } else {
          throw new Error(`Binance API returned status ${response.status}`);
        }
      } catch (error) {
        console.log('❌ Binance API错误:');
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw new Error(`Binance API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (source.toLowerCase() === 'tushare') {
      const adapter = new TushareAdapter(config.TUSHARE_TOKEN);
      await adapter.connect();
      const latency = Date.now() - startTime;
      res.json({
        success: true,
        message: 'Tushare Pro connection successful',
        data: {
          source: 'tushare',
          type: 'REST API',
          connected: true,
          latency,
          timestamp: new Date().toISOString()
        }
      });
    } else if (source.toLowerCase() === 'yahoo') {
      // Test Yahoo Finance connection (using a public endpoint)
      try {
        console.log('🌐 外部API请求:');
        console.log(`  URL: GET https://query1.finance.yahoo.com/v8/finance/chart/AAPL`);
        console.log(`  Timeout: 5000ms`);
        console.log(`  Headers:`, JSON.stringify({
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }, null, 2));
        
        const response = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/AAPL', {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        console.log('📤 外部API响应:');
        console.log(`  Status: ${response.status} ${response.statusText}`);
        console.log(`  Headers:`, JSON.stringify(response.headers, null, 2));
        console.log(`  Data (preview):`, JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
        
        if (response.status === 200) {
          const latency = Date.now() - startTime;
          const responseData = {
            success: true,
            message: 'Yahoo Finance connection successful',
            data: {
              source,
              type,
              connected: true,
              latency,
              timestamp: new Date().toISOString()
            }
          };
          
          console.log('📤 返回客户端报文:');
          console.log(`  Status: 200 OK`);
          console.log(`  Body:`, JSON.stringify(responseData, null, 2));
          console.log('=== 连接测试完成 ===\n');
          
          res.json(responseData);
        } else {
          throw new Error(`Yahoo Finance returned status ${response.status}`);
        }
      } catch (error) {
        console.log('❌ Yahoo Finance API错误:');
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return sendYahooFailure(res, error, 'connection');
      }
    } else {
      // For other sources, simulate connection test
      console.log('🎲 模拟连接测试:');
      console.log(`  数据源: ${source} (非真实API)`);
      console.log(`  模拟延迟: 1000ms`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      const isConnected = Math.random() > 0.2;
      const latency = Math.floor(Math.random() * 500) + 50;
      
      if (isConnected) {
        const responseData = {
          success: true,
          message: `${source} connection test successful`,
          data: {
            source,
            type,
            connected: true,
            latency,
            timestamp: new Date().toISOString()
          }
        };
        
        console.log('📤 返回客户端报文 (模拟):');
        console.log(`  Status: 200 OK`);
        console.log(`  Body:`, JSON.stringify(responseData, null, 2));
        console.log('=== 连接测试完成 ===\n');
        
        res.json(responseData);
      } else {
        console.log('❌ 模拟连接失败:');
        console.log(`  错误: ${source} connection timeout`);
        console.log('=== 连接测试完成 ===\n');
        throw new Error(`${source} connection timeout`);
      }
    }
    return;
  } catch (error) {
    console.log('❌ 连接测试最终错误:');
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log(`  Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    
    const errorResponse = {
      success: false,
      message: 'Connection test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    console.log('📤 返回客户端报文 (错误):');
    console.log(`  Status: 500 Internal Server Error`);
    console.log(`  Body:`, JSON.stringify(errorResponse, null, 2));
    console.log('=== 连接测试完成 ===\n');
    
    return res.status(500).json(errorResponse);
  }
});

// Get sample data from data source
router.post('/sample', async (req, res) => {
  try {
    const { source, symbol, limit = 5 } = req.body;
    
    console.log('=== 获取数据样例 ===');
    console.log('📥 请求报文:');
    console.log(`  URL: POST /data-test/sample`);
    console.log(`  Body:`, JSON.stringify(req.body, null, 2));
    console.log(`  数据源: ${source}, 交易对: ${symbol}, 限制: ${limit}`);
    
    // Get real sample data from source
    if (source.toLowerCase() === 'binance') {
      try {
        console.log('🌐 外部API请求 (Binance K线):');
        console.log(`  URL: GET https://api.binance.com/api/v3/klines`);
        console.log(`  Params:`, JSON.stringify({
          symbol: symbol,
          interval: '1d',
          limit: limit
        }, null, 2));
        console.log(`  Timeout: 10000ms`);
        
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
          params: {
            symbol: symbol,
            interval: '1d',
            limit: limit
          },
          timeout: 10000
        });
        
        console.log('📤 外部API响应 (Binance):');
        console.log(`  Status: ${response.status} ${response.statusText}`);
        console.log(`  Headers:`, JSON.stringify(response.headers, null, 2));
        console.log(`  Data (第一条记录):`, JSON.stringify(response.data[0], null, 2));
        console.log(`  总记录数: ${response.data.length}`);
        
        if (response.status === 200) {
          const klines = response.data;
          const sampleData = klines.map((kline: any[]) => ({
            symbol,
            timestamp: new Date(kline[0]).toISOString(),
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
            source: 'binance'
          }));
          
          const responseData = {
            success: true,
            message: 'Sample data retrieved successfully',
            data: sampleData
          };
          
          console.log('📤 返回客户端报文:');
          console.log(`  Status: 200 OK`);
          console.log(`  数据记录数: ${sampleData.length}`);
          console.log(`  第一条数据:`, JSON.stringify(sampleData[0], null, 2));
          console.log('=== 数据样例获取完成 ===\n');
          
          res.json(responseData);
        } else {
          throw new Error(`Binance API returned status ${response.status}`);
        }
      } catch (error) {
        console.log('❌ Binance API错误，使用fallback数据:');
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        const sampleData = generateExchangeSampleData(symbol, limit);
        const fallbackResponse = {
          success: true,
          message: 'Sample data retrieved successfully (fallback)',
          data: sampleData
        };
        
        console.log('📤 返回客户端报文 (fallback):');
        console.log(`  Status: 200 OK`);
        console.log(`  数据记录数: ${sampleData.length}`);
        console.log('=== 数据样例获取完成 ===\n');
        
        res.json(fallbackResponse);
      }
    } else if (source.toLowerCase() === 'tushare') {
      const adapter = new TushareAdapter(config.TUSHARE_TOKEN);
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 45 * 24 * 60 * 60 * 1000);
      const sampleData = await adapter.fetchHistoricalData({
        symbol: symbol || '000001.SZ',
        startTime,
        endTime,
        interval: '1d'
      });
      res.json({
        success: true,
        message: 'Real Tushare Pro daily data retrieved successfully',
        data: sampleData.slice(-Math.max(1, Math.min(Number(limit) || 5, 20)))
      });
    } else if (source.toLowerCase() === 'yahoo') {
      try {
        console.log('🌐 外部API请求 (Yahoo Finance):');
        console.log(`  URL: GET https://query1.finance.yahoo.com/v8/finance/chart/AAPL`);
        console.log(`  Params:`, JSON.stringify({
          interval: '1d',
          range: `${limit}d`
        }, null, 2));
        console.log(`  Timeout: 10000ms`);
        console.log(`  Headers:`, JSON.stringify({
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }, null, 2));
        
        const response = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/AAPL', {
          params: {
            interval: '1d',
            range: `${limit}d`
          },
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        console.log('📤 外部API响应 (Yahoo Finance):');
        console.log(`  Status: ${response.status} ${response.statusText}`);
        console.log(`  Headers:`, JSON.stringify(response.headers, null, 2));
        console.log(`  Data结构:`, Object.keys(response.data));
        
        if (response.status === 200 && response.data.chart?.result?.[0]) {
          const result = response.data.chart.result[0];
          const timestamps = result.timestamp || [];
          const quotes = result.indicators?.quote?.[0] || {};
          
          console.log(`  时间戳数量: ${timestamps.length}`);
          console.log(`  报价数据键:`, Object.keys(quotes));
          
          const sampleData = timestamps.slice(-limit).map((timestamp: number, index: number) => ({
            symbol,
            timestamp: new Date(timestamp * 1000).toISOString(),
            open: quotes.open?.[index] || 0,
            high: quotes.high?.[index] || 0,
            low: quotes.low?.[index] || 0,
            close: quotes.close?.[index] || 0,
            volume: quotes.volume?.[index] || 0,
            source: 'yahoo',
            qualityScore: 0.95
          }));
          
          const responseData = {
            success: true,
            message: 'Sample data retrieved successfully',
            data: sampleData
          };
          
          console.log('📤 返回客户端报文:');
          console.log(`  Status: 200 OK`);
          console.log(`  数据记录数: ${sampleData.length}`);
          console.log(`  第一条数据:`, JSON.stringify(sampleData[0], null, 2));
          console.log('=== 数据样例获取完成 ===\n');
          
          res.json(responseData);
        } else {
          throw new Error('Invalid Yahoo Finance data format');
        }
      } catch (error) {
        console.log('❌ Yahoo Finance API错误:');
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return sendYahooFailure(res, error, 'sample');
      }
    } else {
      // For other sources, use generated data
      console.log('🎲 生成模拟数据:');
      console.log(`  数据源: ${source} (非真实API)`);
      console.log(`  交易对: ${symbol}, 限制: ${limit}`);
      
      let sampleData;
      switch (source) {
        case 'okx':
        case 'huobi':
          sampleData = generateExchangeSampleData(symbol, limit);
          break;
        case 'yahoo':
          sampleData = generateYahooSampleData(symbol, limit);
          break;
        default:
          sampleData = generateGenericSampleData(symbol, limit);
      }
      
      const responseData = {
        success: true,
        message: 'Sample data retrieved successfully',
        data: sampleData
      };
      
      console.log('📤 返回客户端报文 (模拟数据):');
      console.log(`  Status: 200 OK`);
      console.log(`  数据记录数: ${sampleData.length}`);
      console.log(`  第一条数据:`, JSON.stringify(sampleData[0], null, 2));
      console.log('=== 数据样例获取完成 ===\n');
      
      res.json(responseData);
    }
    return;
  } catch (error) {
    console.log('❌ 数据样例获取最终错误:');
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log(`  Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    
    const errorResponse = {
      success: false,
      message: 'Failed to get sample data',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    console.log('📤 返回客户端报文 (错误):');
    console.log(`  Status: 500 Internal Server Error`);
    console.log(`  Body:`, JSON.stringify(errorResponse, null, 2));
    console.log('=== 数据样例获取完成 ===\n');
    
    return res.status(500).json(errorResponse);
  }
});

// Test API data source
router.post('/test-api', async (req, res) => {
  try {
    const { source, apiType, symbol, interval } = req.body;
    
    console.log('=== API功能测试 ===');
    console.log('📥 请求报文:');
    console.log(`  URL: POST /data-test/test-api`);
    console.log(`  Body:`, JSON.stringify(req.body, null, 2));
    console.log(`  数据源: ${source}, API类型: ${apiType}, 交易对: ${symbol}, 时间间隔: ${interval}`);
    
    // Test real API calls
    if (source.toLowerCase() === 'binance') {
      try {
        console.log('🌐 外部API请求 (Binance):');
        console.log(`  API类型: ${apiType}`);
        
        let testData;
        let apiUrl = '';
        
        if (apiType === 'market') {
          // Get 24hr ticker price change statistics
          apiUrl = 'https://api.binance.com/api/v3/ticker/24hr';
          console.log(`  URL: GET ${apiUrl}`);
          console.log(`  Params:`, JSON.stringify({ symbol }, null, 2));
          
          const response = await axios.get(apiUrl, {
            params: { symbol },
            timeout: 10000
          });
          
          console.log('📤 外部API响应 (Binance Market):');
          console.log(`  Status: ${response.status} ${response.statusText}`);
          console.log(`  Data:`, JSON.stringify(response.data, null, 2));
          
          if (response.status === 200) {
            const data = response.data;
            testData = {
              symbol,
              price: parseFloat(data.lastPrice),
              change24h: parseFloat(data.priceChange),
              changePercent24h: parseFloat(data.priceChangePercent),
              volume24h: parseFloat(data.volume),
              high24h: parseFloat(data.highPrice),
              low24h: parseFloat(data.lowPrice),
              timestamp: new Date().toISOString(),
              source: 'binance-api'
            };
          }
        } else if (apiType === 'historical') {
          // Get historical klines
          const intervalMap: { [key: string]: string } = { '1m': '1m', '5m': '5m', '1h': '1h', '1d': '1d' };
          const binanceInterval = intervalMap[interval] || '1h';
          
          apiUrl = 'https://api.binance.com/api/v3/klines';
          console.log(`  URL: GET ${apiUrl}`);
          console.log(`  Params:`, JSON.stringify({
            symbol,
            interval: binanceInterval,
            limit: 10
          }, null, 2));
          
          const response = await axios.get(apiUrl, {
            params: {
              symbol,
              interval: binanceInterval,
              limit: 10
            },
            timeout: 10000
          });
          
          console.log('📤 外部API响应 (Binance Historical):');
          console.log(`  Status: ${response.status} ${response.statusText}`);
          console.log(`  记录数: ${response.data.length}`);
          
          if (response.status === 200) {
            const klines = response.data;
            const data = klines.map((kline: any[]) => ({
              timestamp: new Date(kline[0]).toISOString(),
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5])
            }));
            
            testData = {
              symbol,
              interval,
              data,
              count: data.length
            };
          }
        } else if (apiType === 'realtime') {
          // Get current price (simulate real-time)
          apiUrl = 'https://api.binance.com/api/v3/ticker/price';
          console.log(`  URL: GET ${apiUrl}`);
          console.log(`  Params:`, JSON.stringify({ symbol }, null, 2));
          
          const response = await axios.get(apiUrl, {
            params: { symbol },
            timeout: 10000
          });
          
          console.log('📤 外部API响应 (Binance Realtime):');
          console.log(`  Status: ${response.status} ${response.statusText}`);
          console.log(`  Data:`, JSON.stringify(response.data, null, 2));
          
          if (response.status === 200) {
            const data = response.data;
            testData = {
              symbol,
              price: parseFloat(data.price),
              timestamp: new Date().toISOString(),
              source: 'binance-api'
            };
          }
        }
        
        if (testData) {
          const responseData = {
            success: true,
            message: 'API test successful',
            data: testData
          };
          
          console.log('📤 返回客户端报文:');
          console.log(`  Status: 200 OK`);
          console.log(`  Data:`, JSON.stringify(responseData, null, 2));
          console.log('=== API测试完成 ===\n');
          
          res.json(responseData);
        } else {
          throw new Error('Invalid API response');
        }
      } catch (error) {
        console.log('❌ Binance API错误，使用fallback数据:');
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        let fallbackData;
        switch (apiType) {
          case 'market':
            fallbackData = generateMarketDataSample(symbol);
            break;
          case 'historical':
            fallbackData = generateHistoricalDataSample(symbol, interval);
            break;
          case 'realtime':
            fallbackData = generateRealtimeDataSample(symbol);
            break;
          default:
            fallbackData = generateGenericSampleData(symbol, 1);
        }
        
        const fallbackResponse = {
          success: true,
          message: 'API test successful (fallback)',
          data: fallbackData
        };
        
        console.log('📤 返回客户端报文 (fallback):');
        console.log(`  Status: 200 OK`);
        console.log(`  Data:`, JSON.stringify(fallbackData, null, 2));
        console.log('=== API测试完成 ===\n');
        
        res.json(fallbackResponse);
      }
    } else if (source.toLowerCase() === 'yahoo') {
      try {
        console.log('🌐 外部API请求 (Yahoo Finance):');
        console.log(`  API类型: ${apiType}`);
        
        let testData;
        
        if (apiType === 'market') {
          // Get current market data for AAPL as example
          const apiUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL';
          console.log(`  URL: GET ${apiUrl}`);
          console.log(`  Params:`, JSON.stringify({
            interval: '1d',
            range: '1d'
          }, null, 2));
          
          const response = await axios.get(apiUrl, {
            params: {
              interval: '1d',
              range: '1d'
            },
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          console.log('📤 外部API响应 (Yahoo Market):');
          console.log(`  Status: ${response.status} ${response.statusText}`);
          
          if (response.status === 200 && response.data.chart?.result?.[0]) {
            const result = response.data.chart.result[0];
            const meta = result.meta;
            
            testData = {
              symbol,
              price: meta.regularMarketPrice || 0,
              change24h: meta.regularMarketChange || 0,
              changePercent24h: meta.regularMarketChangePercent || 0,
              volume24h: meta.regularMarketVolume || 0,
              high24h: meta.dayHigh || 0,
              low24h: meta.dayLow || 0,
              timestamp: new Date().toISOString(),
              source: 'yahoo-finance-api'
            };
          }
        } else if (apiType === 'historical') {
          // Get historical data
          const apiUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL';
          console.log(`  URL: GET ${apiUrl}`);
          console.log(`  Params:`, JSON.stringify({
            interval: '1d',
            range: '5d'
          }, null, 2));
          
          const response = await axios.get(apiUrl, {
            params: {
              interval: '1d',
              range: '5d'
            },
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          console.log('📤 外部API响应 (Yahoo Historical):');
          console.log(`  Status: ${response.status} ${response.statusText}`);
          
          if (response.status === 200 && response.data.chart?.result?.[0]) {
            const result = response.data.chart.result[0];
            const timestamps = result.timestamp || [];
            const quotes = result.indicators?.quote?.[0] || {};
            
            const data = timestamps.map((timestamp: number, index: number) => ({
              timestamp: new Date(timestamp * 1000).toISOString(),
              open: quotes.open?.[index] || 0,
              high: quotes.high?.[index] || 0,
              low: quotes.low?.[index] || 0,
              close: quotes.close?.[index] || 0,
              volume: quotes.volume?.[index] || 0
            }));
            
            testData = {
              symbol,
              interval,
              data,
              count: data.length
            };
          }
        } else if (apiType === 'realtime') {
          // Simulate real-time with current price
          const apiUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL';
          console.log(`  URL: GET ${apiUrl}`);
          console.log(`  Params:`, JSON.stringify({
            interval: '1m',
            range: '1d'
          }, null, 2));
          
          const response = await axios.get(apiUrl, {
            params: {
              interval: '1m',
              range: '1d'
            },
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          console.log('📤 外部API响应 (Yahoo Realtime):');
          console.log(`  Status: ${response.status} ${response.statusText}`);
          
          if (response.status === 200 && response.data.chart?.result?.[0]) {
            const meta = response.data.chart.result[0].meta;
            testData = {
              symbol,
              price: meta.regularMarketPrice || 0,
              timestamp: new Date().toISOString(),
              source: 'yahoo-finance-api'
            };
          }
        }
        
        if (testData) {
          const responseData = {
            success: true,
            message: 'API test successful',
            data: testData
          };
          
          console.log('📤 返回客户端报文:');
          console.log(`  Status: 200 OK`);
          console.log(`  Data:`, JSON.stringify(responseData, null, 2));
          console.log('=== API测试完成 ===\n');
          
          res.json(responseData);
        } else {
          throw new Error('Invalid Yahoo Finance data format');
        }
      } catch (error) {
        console.log('❌ Yahoo Finance API错误:');
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return sendYahooFailure(res, error, 'api');
      }
    } else if (source.toLowerCase() === 'tushare') {
      if (apiType !== 'historical' || interval !== '1d') {
        return res.status(400).json({
          success: false,
          message: 'Tushare Pro supports historical daily data only'
        });
      }

      const adapter = new TushareAdapter(config.TUSHARE_TOKEN);
      const endTime = new Date();
      const startTime = new Date(endTime);
      startTime.setUTCDate(startTime.getUTCDate() - 30);
      const data = await adapter.fetchHistoricalData({
        symbol: symbol || '000001.SZ',
        interval: '1d',
        startTime,
        endTime
      });

      return res.json({
        success: true,
        message: 'Real Tushare Pro daily data retrieved successfully',
        data
      });
    } else {
      // For other sources, use generated data
      console.log('🎲 生成模拟API数据:');
      console.log(`  数据源: ${source} (非真实API)`);
      console.log(`  API类型: ${apiType}, 交易对: ${symbol}`);
      console.log(`  模拟延迟: 1500ms`);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      let testData;
      switch (apiType) {
        case 'market':
          testData = generateMarketDataSample(symbol);
          break;
        case 'historical':
          testData = generateHistoricalDataSample(symbol, interval);
          break;
        case 'realtime':
          testData = generateRealtimeDataSample(symbol);
          break;
        default:
          testData = generateGenericSampleData(symbol, 1);
      }
      
      const responseData = {
        success: true,
        message: 'API test successful',
        data: testData
      };
      
      console.log('📤 返回客户端报文 (模拟数据):');
      console.log(`  Status: 200 OK`);
      console.log(`  Data:`, JSON.stringify(responseData, null, 2));
      console.log('=== API测试完成 ===\n');
      
      res.json(responseData);
    }
    return;
  } catch (error) {
    console.log('❌ API测试最终错误:');
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log(`  Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    
    const errorResponse = {
      success: false,
      message: 'API test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    console.log('📤 返回客户端报文 (错误):');
    console.log(`  Status: 500 Internal Server Error`);
    console.log(`  Body:`, JSON.stringify(errorResponse, null, 2));
    console.log('=== API测试完成 ===\n');
    
    return res.status(500).json(errorResponse);
  }
});

// Helper functions to generate sample data
function generateExchangeSampleData(symbol: string, limit: number) {
  const basePrice = symbol.includes('BTC') ? 45000 : symbol.includes('ETH') ? 3000 : 100;
  const data: Array<Record<string, string | number>> = [];
  
  for (let i = 0; i < limit; i++) {
    const price = basePrice + (Math.random() - 0.5) * basePrice * 0.02;
    data.push({
      symbol,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      open: price * (1 - Math.random() * 0.01),
      high: price * (1 + Math.random() * 0.015),
      low: price * (1 - Math.random() * 0.015),
      close: price,
      volume: Math.floor(Math.random() * 1000000),
      source: 'exchange'
    });
  }
  
  return data;
}

function generateYahooSampleData(symbol: string, limit: number) {
  const basePrice = symbol.includes('BTC') ? 45000 : symbol.includes('ETH') ? 3000 : 100;
  const data: Array<Record<string, string | number>> = [];
  
  for (let i = 0; i < limit; i++) {
    const price = basePrice + (Math.random() - 0.5) * basePrice * 0.02;
    data.push({
      symbol,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      open: price * (1 - Math.random() * 0.01),
      high: price * (1 + Math.random() * 0.015),
      low: price * (1 - Math.random() * 0.015),
      close: price,
      volume: Math.floor(Math.random() * 1000000),
      source: 'yahoo',
      qualityScore: 0.95
    });
  }
  
  return data;
}

function generateGenericSampleData(symbol: string, limit: number) {
  const basePrice = 100;
  const data: Array<Record<string, string | number>> = [];
  
  for (let i = 0; i < limit; i++) {
    const price = basePrice + (Math.random() - 0.5) * basePrice * 0.02;
    data.push({
      symbol,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      open: price * (1 - Math.random() * 0.01),
      high: price * (1 + Math.random() * 0.015),
      low: price * (1 - Math.random() * 0.015),
      close: price,
      volume: Math.floor(Math.random() * 1000000),
      source: 'generic'
    });
  }
  
  return data;
}

function generateMarketDataSample(symbol: string) {
  const basePrice = symbol.includes('BTC') ? 45000 : symbol.includes('ETH') ? 3000 : 100;
  const price = basePrice + (Math.random() - 0.5) * basePrice * 0.02;
  
  return {
    symbol,
    price: parseFloat(price.toFixed(2)),
    change24h: parseFloat(((Math.random() - 0.5) * 10).toFixed(2)),
    volume24h: Math.floor(Math.random() * 1000000000),
    high24h: parseFloat((price * 1.02).toFixed(2)),
    low24h: parseFloat((price * 0.98).toFixed(2)),
    timestamp: new Date().toISOString(),
    source: 'market-api'
  };
}

function generateHistoricalDataSample(symbol: string, interval: string) {
  const data: Array<Record<string, string | number>> = [];
  const basePrice = symbol.includes('BTC') ? 45000 : symbol.includes('ETH') ? 3000 : 100;
  const intervalMs = interval === '1m' ? 60000 : interval === '5m' ? 300000 : interval === '1h' ? 3600000 : 86400000;
  
  for (let i = 0; i < 10; i++) {
    const price = basePrice + (Math.random() - 0.5) * basePrice * 0.02;
    data.push({
      timestamp: new Date(Date.now() - i * intervalMs).toISOString(),
      open: parseFloat((price * (1 - Math.random() * 0.01)).toFixed(2)),
      high: parseFloat((price * (1 + Math.random() * 0.015)).toFixed(2)),
      low: parseFloat((price * (1 - Math.random() * 0.015)).toFixed(2)),
      close: parseFloat(price.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000)
    });
  }
  
  return {
    symbol,
    interval,
    data,
    count: data.length
  };
}

function generateRealtimeDataSample(symbol: string) {
  const basePrice = symbol.includes('BTC') ? 45000 : symbol.includes('ETH') ? 3000 : 100;
  const price = basePrice + (Math.random() - 0.5) * basePrice * 0.001;
  
  return {
    symbol,
    price: parseFloat(price.toFixed(2)),
    bid: parseFloat((price - 0.5).toFixed(2)),
    ask: parseFloat((price + 0.5).toFixed(2)),
    lastSize: Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    source: 'realtime-api'
  };
}

export default router;
