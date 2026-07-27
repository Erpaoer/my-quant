export interface DashboardTab {
  id: string;
  title: string;
  icon?: string;
  component: any;
  props?: Record<string, any>;
  pinned?: boolean;
}

const definitions: Record<string, Omit<DashboardTab, "id">> = {
  dashboard: { title: "总览", icon: "Monitor", component: "DashboardOverview", pinned: true },
  strategies: { title: "策略列表", icon: "TrendCharts", component: "StrategyList" },
  "strategy-editor": { title: "策略编辑器", icon: "Edit", component: "CreateStrategy" },
  "strategy-templates": { title: "策略模板", icon: "Files", component: "StrategyTemplates" },
  optimization: { title: "参数优化", icon: "Aim", component: "ParameterOptimization" },
  backtest: { title: "回测设置", icon: "VideoPlay", component: "BacktestSettings" },
  "backtest-results": { title: "回测结果", icon: "DataLine", component: "BacktestResult" },
  "new-backtest": { title: "新策略回测", icon: "Cpu", component: () => import("@/views/backtest/NewBacktestTest.vue") },
  trading: { title: "交易面板", icon: "Money", component: "TradingPanel" },
  "realtime-trading": { title: "实时交易", icon: "Lightning", component: () => import("@/views/trading/RealTimeTrading.vue") },
  orders: { title: "订单管理", icon: "List", component: "OrdersManagement" },
  positions: { title: "持仓管理", icon: "PieChart", component: "PositionsManagement" },
  accounts: { title: "账户管理", icon: "Wallet", component: "Accounts" },
  "trading-logs": { title: "交易日志", icon: "Document", component: () => import("@/views/trading/TradingLogs.vue") },
  "risk-control": { title: "风控规则", icon: "Warning", component: "Monitoring" },
  alerts: { title: "预警监控", icon: "Bell", component: "Monitoring" },
  "market-data": { title: "市场数据", icon: "DataBoard", component: () => import("@/views/market/MarketData.vue") },
  "data-source-test": { title: "数据源测试", icon: "Connection", component: () => import("@/views/market/DataSourceTest.vue") },
  "data-import": { title: "数据导入", icon: "Upload", component: () => import("@/views/market/DataImport.vue") },
  users: { title: "用户管理", icon: "User", component: () => import("@/views/user/Users.vue") },
  settings: { title: "系统设置", icon: "Setting", component: () => import("@/views/settings/Settings.vue") },
  logs: { title: "系统日志", icon: "Document", component: () => import("@/views/logs/SystemLogs.vue") },
};

export const staticTabIds = new Set(Object.keys(definitions));

export function createStaticTab(id: string): DashboardTab | null {
  const definition = definitions[id];
  return definition ? { id, ...definition } : null;
}
