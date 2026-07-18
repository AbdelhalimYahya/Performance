import { Suspense } from 'react';

// ============================================================================
// Slow Data Fetchers (simulating real-world latency)
// ============================================================================

async function fetchUserStats() {
  await new Promise((r) => setTimeout(r, 800));
  return {
    totalUsers: 12_458,
    activeToday: 1_234,
    avgSessionTime: '4m 32s',
  };
}

async function fetchRecentOrders() {
  await new Promise((r) => setTimeout(r, 1200));
  return Array.from({ length: 5 }, (_, i) => ({
    id: `ORD-${1000 + i}`,
    customer: `Customer ${i + 1}`,
    total: Math.round(Math.random() * 500 + 10),
    status: ['Pending', 'Shipped', 'Delivered'][i % 3],
  }));
}

async function fetchRevenueData() {
  await new Promise((r) => setTimeout(r, 1500));
  return {
    monthly: [12_000, 15_000, 18_000, 22_000, 19_000, 24_000],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  };
}

// ============================================================================
// Streaming Components with Suspense Boundaries
// ============================================================================

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold text-gray-400 mb-4">{title}</h3>
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-6 bg-gray-700 rounded" />
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-4 italic">Loading...</p>
    </div>
  );
}

async function UserStatsSection() {
  const stats = await fetchUserStats();
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold text-blue-400 mb-4">User Stats</h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-bold text-white">{stats.totalUsers.toLocaleString()}</p>
          <p className="text-xs text-gray-400">Total Users</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{stats.activeToday.toLocaleString()}</p>
          <p className="text-xs text-gray-400">Active Today</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{stats.avgSessionTime}</p>
          <p className="text-xs text-gray-400">Avg Session</p>
        </div>
      </div>
    </div>
  );
}

async function RecentOrdersSection() {
  const orders = await fetchRecentOrders();
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold text-green-400 mb-4">Recent Orders</h3>
      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="flex justify-between items-center py-2 border-b border-gray-700">
            <div>
              <span className="text-sm text-white font-mono">{o.id}</span>
              <span className="text-sm text-gray-400 ml-2">{o.customer}</span>
            </div>
            <div className="text-right">
              <span className="text-sm text-white">${o.total}</span>
              <span className="text-xs text-gray-500 ml-2">{o.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function RevenueSection() {
  const data = await fetchRevenueData();
  const max = Math.max(...data.monthly);
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold text-purple-400 mb-4">Revenue (Last 6 Months)</h3>
      <div className="flex items-end gap-2 h-40">
        {data.monthly.map((val, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-gray-400">${(val / 1000).toFixed(0)}k</span>
            <div
              className="w-full bg-purple-500 rounded-t"
              style={{ height: `${(val / max) * 100}%` }}
            />
            <span className="text-xs text-gray-500">{data.labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Streaming Demo Page
// ============================================================================

export default function StreamingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Streaming with Suspense</h1>
        <p className="text-gray-400 mb-2">
          Each section streams independently. The page shell loads first, then sections appear as their data arrives.
        </p>
        <p className="text-xs text-gray-500 mb-8">
          Refresh and watch: User Stats loads first (800ms), then Orders (1200ms), then Revenue (1500ms).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Suspense fallback={<SectionSkeleton title="User Stats" />}>
            <UserStatsSection />
          </Suspense>

          <Suspense fallback={<SectionSkeleton title="Recent Orders" />}>
            <RecentOrdersSection />
          </Suspense>

          <Suspense fallback={<SectionSkeleton title="Revenue" />}>
            <RevenueSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
