import { initDataManager, YahooFinanceAdapter, DataSourceConfig, initDataCache } from '../services/data';

async function demonstrateFeatures() {
  console.log('🎯 数据源功能演示\n');

  // 1. 初始化缓存
  initDataCache({
    enabled: true,
    ttl: 3600,
    maxSize: 1000
  });
  console.log('✅ 数据缓存已初始化');

  // 2. 初始化数据管理器
  const manager = initDataManager();
  
  // 3. 配置并注册Yahoo Finance适配器
  const config: DataSourceConfig = {
    name: 'Yahoo Finance',
    type: 'rest',
    rateLimit: 50,  // 降低频率限制避免被封
    timeout: 15000,
    enabled: true
  };
  
  const adapter = new YahooFinanceAdapter(config);
  manager.registerAdapter(adapter);
  
  // 4. 初始化数据管理器
  await manager.initialize();
  console.log('✅ 数据管理器已初始化\n');

  // 5. 演示功能
  console.log('📊 演示1: 数据源状态');
  const statuses = manager.getAdapterStatuses();
  console.log('数据源状态:', JSON.stringify(statuses, null, 2));
  console.log();

  console.log('📈 演示2: 获取历史数据');
  try {
    const historicalData = await manager.fetchHistoricalData({
      symbol: 'AAPL',
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(),
      interval: '1d'
    });
    
    console.log(`获取到 ${historicalData.length} 条历史数据`);
    if (historicalData.length > 0) {
      console.log('最新数据:', {
        日期: historicalData[historicalData.length - 1].timestamp.toLocaleDateString(),
        收盘价: historicalData[historicalData.length - 1].close,
        成交量: historicalData[historicalData.length - 1].volume
      });
    }
  } catch (error) {
    console.log('获取历史数据失败:', error instanceof Error ? error.message : String(error));
  }
  console.log();

  console.log('⚡ 演示3: 获取实时数据');
  try {
    const realTimeData = await manager.fetchRealTimeData(['AAPL', 'GOOGL']);
    console.log(`获取到 ${realTimeData.length} 个股票的实时数据`);
    realTimeData.forEach(data => {
      console.log(`${data.symbol}: $${data.close}`);
    });
  } catch (error) {
    console.log('获取实时数据失败:', error instanceof Error ? error.message : String(error));
  }
  console.log();

  console.log('🔍 演示4: 数据质量报告');
  try {
    const qualityReport = await manager.getDataQualityReport(['AAPL']);
    console.log('数据质量报告:', JSON.stringify(qualityReport[0], null, 2));
  } catch (error) {
    console.log('获取数据质量报告失败:', error instanceof Error ? error.message : String(error));
  }
  console.log();

  console.log('🎉 演示完成！');
  
  // 清理资源
  await manager.shutdown();
}

// 运行演示
demonstrateFeatures().catch(console.error);
