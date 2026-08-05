"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileWarning,
  History,
  Loader2,
  LockKeyhole,
  PackageCheck,
  PlayCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Unlock,
  XCircle,
} from "lucide-react";
import {
  EXCEPTION_LABELS,
  LOGISTICS_EXCEPTION_OPTIONS,
  QUALITY_EXCEPTION_OPTIONS,
  STATUS_LABELS,
  type ApprovalRule,
  type ExceptionTicket,
  type LogisticsExceptionType,
  type QualityRule,
  type SyncLog,
  type TicketDetail,
  type TicketStatus,
  type V3User,
} from "@/lib/v3/types";

type ActiveView = "overview" | "scan" | "tickets" | "rules" | "sync";

type TicketListResponse = {
  items: ExceptionTicket[];
  total: number;
  page: number;
  pageSize: number;
};

type RuleResponse = {
  approvalRules: ApprovalRule[];
  qualityRules: QualityRule[];
};

type DashboardResponse = {
  stats: {
    statusCounts: Partial<Record<TicketStatus, number>>;
    categoryCounts: Partial<Record<"logistics" | "quality", number>>;
    syncSuccessRate: number;
    lastSyncAt: string | null;
  };
};

type SyncResponse = {
  logs: SyncLog[];
  summary: {
    total: number;
    success: number;
    successRate: number;
    lastSyncAt: string | null;
  };
};

type TicketFilterState = {
  status: string;
  category: string;
  exceptionType: string;
  assigneeId: string;
  waybillNo: string;
  q: string;
};

const ROLE_LABELS: Record<string, string> = {
  operator: "操作员",
  level1_approver: "一级审批",
  level2_approver: "二级审批",
  quality_supervisor: "品控主管",
  admin: "管理员",
};

const STATUS_OPTIONS: Array<{ value: TicketStatus | ""; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "level1_review", label: "一级审批中" },
  { value: "level2_review", label: "二级审批中" },
  { value: "rejected", label: "已驳回待重提" },
  { value: "completed", label: "已完成" },
  { value: "closed", label: "已关闭" },
];

const EXCEPTION_OPTIONS = [
  { value: "", label: "全部异常" },
  ...LOGISTICS_EXCEPTION_OPTIONS,
  ...QUALITY_EXCEPTION_OPTIONS,
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload as T;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatAmount(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function isNearDeadline(value?: string | null) {
  if (!value) return false;
  const diff = new Date(value).getTime() - Date.now();
  return diff > 0 && diff < 4 * 60 * 60 * 1000;
}

export function V3Workspace() {
  const [activeView, setActiveView] = useState<ActiveView>("overview");
  const [users, setUsers] = useState<V3User[]>([]);
  const [currentActorId, setCurrentActorId] = useState("u-level1");
  const [tickets, setTickets] = useState<TicketListResponse>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [filters, setFilters] = useState<TicketFilterState>({
    status: "",
    category: "",
    exceptionType: "",
    assigneeId: "",
    waybillNo: "",
    q: "",
  });
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [rules, setRules] = useState<RuleResponse>({ approvalRules: [], qualityRules: [] });
  const [syncLogs, setSyncLogs] = useState<SyncResponse>({ logs: [], summary: { total: 0, success: 0, successRate: 0, lastSyncAt: null } });
  const [dashboard, setDashboard] = useState<DashboardResponse["stats"] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const currentActor = useMemo(() => users.find((user) => user.id === currentActorId), [users, currentActorId]);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    try {
      await Promise.all([loadUsers(), loadTickets(1), loadRules(), loadSyncLogs(), loadDashboard()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "初始化失败，请检查数据库和 V2 接口配置。");
    }
  }

  async function withBusy<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setMessage("");
    try {
      const result = await fn();
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function loadUsers() {
    const payload = await fetchJson<{ users: V3User[] }>("/api/v3/users");
    setUsers(payload.users);
    if (!payload.users.some((user) => user.id === currentActorId)) {
      setCurrentActorId(payload.users[0]?.id || "");
    }
  }

  async function loadTickets(page = tickets.page) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(tickets.pageSize),
      status: filters.status,
      category: filters.category,
      exceptionType: filters.exceptionType,
      assigneeId: filters.assigneeId,
      waybillNo: filters.waybillNo,
      q: filters.q,
    });
    const payload = await fetchJson<TicketListResponse>(`/api/v3/tickets?${params.toString()}`);
    setTickets(payload);
  }

  async function loadTicketDetail(ticketId: string) {
    const payload = await fetchJson<{ ticket: TicketDetail }>(`/api/v3/tickets/${ticketId}`);
    setSelectedTicket(payload.ticket);
  }

  async function loadRules() {
    const payload = await fetchJson<RuleResponse>("/api/v3/rules");
    setRules(payload);
  }

  async function loadSyncLogs() {
    const payload = await fetchJson<SyncResponse>("/api/v3/sync-logs?limit=30");
    setSyncLogs(payload);
  }

  async function loadDashboard() {
    const payload = await fetchJson<DashboardResponse>("/api/v3/dashboard");
    setDashboard(payload.stats);
  }

  async function refreshAll() {
    await withBusy("refresh", async () => {
      await Promise.all([loadTickets(), loadRules(), loadSyncLogs(), loadDashboard()]);
      setMessage("数据已刷新。");
    });
  }

  async function seedDemo() {
    await withBusy("seed", async () => {
      const payload = await fetchJson<{ requested: number; inserted: number }>("/api/v3/seed", {
        method: "POST",
        body: JSON.stringify({ count: 220 }),
      });
      await Promise.all([loadTickets(1), loadDashboard()]);
      setMessage(`样本数据已生成：请求 ${payload.requested} 条，新插入 ${payload.inserted} 条。`);
    });
  }

  async function runMaintenance() {
    await withBusy("maintenance", async () => {
      const payload = await fetchJson<{ reassigned: number; escalated: number; autoRejected: number }>("/api/v3/maintenance", {
        method: "POST",
      });
      await Promise.all([loadTickets(), selectedTicket ? loadTicketDetail(selectedTicket.id) : Promise.resolve(), loadDashboard()]);
      setMessage(`维护任务完成：转交 ${payload.reassigned}，升级 ${payload.escalated}，自动驳回 ${payload.autoRejected}。`);
    });
  }

  return (
    <main className="min-h-screen bg-[var(--workspace)] text-[var(--text)]">
      <TopBar actor={currentActor} users={users} actorId={currentActorId} onActorChange={setCurrentActorId} onRefresh={refreshAll} busy={busy === "refresh"} />
      <div className="flex min-h-[calc(100vh-64px)]">
        <SideNav activeView={activeView} onChange={setActiveView} />
        <section className="min-w-0 flex-1 p-4">
          <div className="grid gap-4">
            <Toolbar message={message} onSeed={seedDemo} onMaintenance={runMaintenance} busy={busy} />
            {activeView === "overview" ? <Overview stats={dashboard} onOpenTickets={() => setActiveView("tickets")} /> : null}
            {activeView === "scan" ? (
              <ScanPanel
                actorId={currentActorId}
                busy={busy}
                onSubmit={async (body) => {
                  await withBusy("scan", async () => {
                    const payload = await fetchJson<{ message: string; ticketId?: string }>("/api/v3/scans", {
                      method: "POST",
                      body: JSON.stringify(body),
                    });
                    await Promise.all([loadTickets(1), loadDashboard()]);
                    if (payload.ticketId) await loadTicketDetail(payload.ticketId);
                    setMessage(payload.message);
                  });
                }}
              />
            ) : null}
            {activeView === "tickets" ? (
              <TicketPanel
                tickets={tickets}
                users={users}
                filters={filters}
                onFiltersChange={setFilters}
                onSearch={() => void loadTickets(1)}
                onPage={loadTickets}
                selectedTicket={selectedTicket}
                onSelect={loadTicketDetail}
                actorId={currentActorId}
                busy={busy}
                onManualSubmit={async (body) => {
                  await withBusy("manual", async () => {
                    const payload = await fetchJson<{ ticket: TicketDetail }>("/api/v3/tickets", {
                      method: "POST",
                      body: JSON.stringify(body),
                    });
                    setSelectedTicket(payload.ticket);
                    await Promise.all([loadTickets(1), loadDashboard(), loadSyncLogs()]);
                    setMessage("物流异常工单已创建，运单已通过 V2 实时接口校验。");
                  });
                }}
                onApprove={async (ticket, decision, comment) => {
                  await withBusy(`approve-${decision}`, async () => {
                    const payload = await fetchJson<{ ticket: TicketDetail }>(`/api/v3/tickets/${ticket.id}/approve`, {
                      method: "POST",
                      body: JSON.stringify({
                        actorId: currentActorId,
                        decision,
                        comment,
                        expectedVersion: ticket.version,
                        idempotencyKey: `${ticket.id}-${currentActorId}-${decision}-${ticket.version}`,
                      }),
                    });
                    setSelectedTicket(payload.ticket);
                    await Promise.all([loadTickets(), loadDashboard()]);
                    setMessage(decision === "approve" ? "审批已提交，下游联动已在同一事务内完成或升级。" : "工单已驳回。");
                  });
                }}
                onQuickRelease={async (ticket, reason) => {
                  await withBusy("quickRelease", async () => {
                    const payload = await fetchJson<{ ticket: TicketDetail }>(`/api/v3/tickets/${ticket.id}/quick-release`, {
                      method: "POST",
                      body: JSON.stringify({ actorId: currentActorId, reason }),
                    });
                    setSelectedTicket(payload.ticket);
                    await Promise.all([loadTickets(), loadDashboard()]);
                    setMessage("品控主管已快速放行，批次解锁并留痕。");
                  });
                }}
                onResubmit={async (ticket, description) => {
                  await withBusy("resubmit", async () => {
                    const payload = await fetchJson<{ ticket: TicketDetail }>(`/api/v3/tickets/${ticket.id}/resubmit`, {
                      method: "POST",
                      body: JSON.stringify({ actorId: currentActorId, description }),
                    });
                    setSelectedTicket(payload.ticket);
                    await loadTickets();
                    setMessage("工单已重新提交。");
                  });
                }}
              />
            ) : null}
            {activeView === "rules" ? <RulesPanel rules={rules} onReload={loadRules} busy={busy} setBusy={setBusy} setMessage={setMessage} /> : null}
            {activeView === "sync" ? <SyncPanel data={syncLogs} onReload={loadSyncLogs} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function TopBar({
  actor,
  users,
  actorId,
  onActorChange,
  onRefresh,
  busy,
}: {
  actor?: V3User;
  users: V3User[];
  actorId: string;
  onActorChange: (id: string) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  return (
    <header className="flex h-16 items-center justify-between bg-[linear-gradient(100deg,var(--topbar-start),var(--topbar-end))] px-5 text-white">
      <div className="flex h-full items-center gap-3">
        <div className="text-4xl font-black italic leading-none tracking-normal">ZT</div>
        <div className="leading-tight">
          <div className="text-lg font-bold">中通冷链</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-90">WAYBILL LIFECYCLE V3</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="hidden text-white/80 sm:inline">当前角色</span>
          <select value={actorId} onChange={(event) => onActorChange(event.target.value)} className="h-9 rounded border border-white/30 bg-white/95 px-3 text-sm text-slate-900 outline-none">
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {ROLE_LABELS[user.role]}{user.enabled ? "" : " · 禁用"}
              </option>
            ))}
          </select>
        </label>
        <span className="hidden rounded bg-white/15 px-2 py-1 text-xs sm:inline">{actor?.warehouseId || "WH-SH-01"}</span>
        <button type="button" onClick={onRefresh} className="inline-flex h-9 items-center gap-2 rounded border border-white/30 px-3 text-sm font-semibold hover:bg-white/10">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
      </div>
    </header>
  );
}

function SideNav({ activeView, onChange }: { activeView: ActiveView; onChange: (view: ActiveView) => void }) {
  const items: Array<{ view: ActiveView; label: string; icon: ReactNode }> = [
    { view: "overview", label: "流程总览", icon: <Database className="h-5 w-5" /> },
    { view: "scan", label: "扫描品控", icon: <PackageCheck className="h-5 w-5" /> },
    { view: "tickets", label: "异常工单", icon: <ClipboardCheck className="h-5 w-5" /> },
    { view: "rules", label: "规则配置", icon: <Settings2 className="h-5 w-5" /> },
    { view: "sync", label: "接口监控", icon: <History className="h-5 w-5" /> },
  ];
  return (
    <aside className="relative hidden w-60 shrink-0 bg-[var(--sidebar)] text-slate-200 md:block">
      <div className="flex h-12 items-center border-b border-white/10 px-4 text-sm font-semibold text-white">运单全生命周期</div>
      <nav className="space-y-1 px-2 py-3">
        {items.map((item) => (
          <button
            type="button"
            key={item.view}
            onClick={() => onChange(item.view)}
            className={`flex h-12 w-full items-center gap-3 rounded-sm px-3 text-left text-[15px] font-semibold ${
              activeView === item.view ? "bg-[var(--sidebar-active)] text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <a
          href="/import"
          className="flex h-12 w-full items-center gap-3 rounded-sm px-3 text-left text-[15px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <ArrowUpRight className="h-5 w-5" />
          异步导入工作台
        </a>
      </nav>
      <div className="absolute bottom-4 left-3 right-3 rounded-md bg-white/10 px-3 py-2 text-xs leading-5 text-slate-200">
        V3 独立库 · HTTP 对接 V2 · 审批与库存赔付事务联动
      </div>
    </aside>
  );
}

function Toolbar({ message, onSeed, onMaintenance, busy }: { message: string; onSeed: () => void; onMaintenance: () => void; busy: string }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Control Center</p>
          <h1 className="mt-1 text-xl font-semibold">运单异常审批与品控联动</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={onSeed} disabled={busy === "seed"} icon={busy === "seed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}>
            生成 200+ 样本
          </ActionButton>
          <ActionButton onClick={onMaintenance} disabled={busy === "maintenance"} icon={busy === "maintenance" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}>
            运行超时任务
          </ActionButton>
        </div>
      </div>
      {message ? <p className="mt-3 rounded bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-dark)]">{message}</p> : null}
    </Panel>
  );
}

function Overview({ stats, onOpenTickets }: { stats: DashboardResponse["stats"] | null; onOpenTickets: () => void }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--muted)]">State Machine</p>
            <h2 className="mt-1 text-lg font-semibold">双状态机拆分</h2>
          </div>
          <button type="button" onClick={onOpenTickets} className="inline-flex items-center gap-2 rounded bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">
            <ArrowUpRight className="h-4 w-4" />
            进入工单
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <FlowNode tone="cyan" icon={<PackageCheck className="h-4 w-4" />} title="扫描录入" text="SKU 归属实时校验" />
          <FlowNode tone="amber" icon={<LockKeyhole className="h-4 w-4" />} title="品控暂扣" text="批次锁定独立计时" />
          <FlowNode tone="blue" icon={<ClipboardCheck className="h-4 w-4" />} title="分级审批" text="阈值规则可配置" />
          <FlowNode tone="green" icon={<ShieldCheck className="h-4 w-4" />} title="执行联动" text="赔付库存事务提交" />
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">运行概览</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="一级审批中" value={String(stats?.statusCounts.level1_review || 0)} icon={<ClipboardCheck className="h-4 w-4" />} />
          <Metric label="二级审批中" value={String(stats?.statusCounts.level2_review || 0)} icon={<ShieldCheck className="h-4 w-4" />} />
          <Metric label="品控工单" value={String(stats?.categoryCounts.quality || 0)} icon={<PackageCheck className="h-4 w-4" />} />
          <Metric label="接口成功率" value={`${stats?.syncSuccessRate || 0}%`} icon={<History className="h-4 w-4" />} />
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">最近同步：{formatTime(stats?.lastSyncAt)}</p>
      </Panel>
    </section>
  );
}

function ScanPanel({
  actorId,
  busy,
  onSubmit,
}: {
  actorId: string;
  busy: string;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    waybillNo: "",
    skuCode: "",
    batchNo: "",
    description: "",
    quantityDeltaPercent: "0",
    damageLevel: "0",
    specDeviationMm: "0",
    labelMatched: "true",
    batchAgeDays: "0",
  });
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Quality Scan</p>
          <h2 className="mt-1 text-lg font-semibold">扫描品控录入</h2>
        </div>
        <Badge tone="amber">命中规则后自动暂扣</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Input label="运单号" value={form.waybillNo} onChange={(value) => setForm((prev) => ({ ...prev, waybillNo: value }))} />
        <Input label="SKU" value={form.skuCode} onChange={(value) => setForm((prev) => ({ ...prev, skuCode: value }))} />
        <Input label="批次号" value={form.batchNo} onChange={(value) => setForm((prev) => ({ ...prev, batchNo: value }))} />
        <Input label="数量差异 %" type="number" value={form.quantityDeltaPercent} onChange={(value) => setForm((prev) => ({ ...prev, quantityDeltaPercent: value }))} />
        <Input label="破损等级" type="number" value={form.damageLevel} onChange={(value) => setForm((prev) => ({ ...prev, damageLevel: value }))} />
        <Input label="规格偏差 mm" type="number" value={form.specDeviationMm} onChange={(value) => setForm((prev) => ({ ...prev, specDeviationMm: value }))} />
        <label className="grid gap-1.5 text-sm">
          <span className="text-slate-700">标签一致</span>
          <select value={form.labelMatched} onChange={(event) => setForm((prev) => ({ ...prev, labelMatched: event.target.value }))} className="h-9 rounded border border-[var(--line-strong)] bg-white px-3 outline-none">
            <option value="true">一致</option>
            <option value="false">不一致</option>
          </select>
        </label>
        <Input label="批次库龄天" type="number" value={form.batchAgeDays} onChange={(value) => setForm((prev) => ({ ...prev, batchAgeDays: value }))} />
        <div className="md:col-span-2">
          <Input label="异常描述" value={form.description} onChange={(value) => setForm((prev) => ({ ...prev, description: value }))} />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <PrimaryButton
          disabled={busy === "scan"}
          onClick={() =>
            onSubmit({
              ...form,
              operatorId: actorId,
              quantityDeltaPercent: Number(form.quantityDeltaPercent),
              damageLevel: Number(form.damageLevel),
              specDeviationMm: Number(form.specDeviationMm),
              labelMatched: form.labelMatched === "true",
              batchAgeDays: Number(form.batchAgeDays),
            })
          }
          icon={busy === "scan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
        >
          提交扫描
        </PrimaryButton>
      </div>
    </Panel>
  );
}

function TicketPanel({
  tickets,
  users,
  filters,
  onFiltersChange,
  onSearch,
  onPage,
  selectedTicket,
  onSelect,
  actorId,
  busy,
  onManualSubmit,
  onApprove,
  onQuickRelease,
  onResubmit,
}: {
  tickets: TicketListResponse;
  users: V3User[];
  filters: TicketFilterState;
  onFiltersChange: (next: TicketFilterState) => void;
  onSearch: () => void;
  onPage: (page: number) => Promise<void>;
  selectedTicket: TicketDetail | null;
  onSelect: (ticketId: string) => Promise<void>;
  actorId: string;
  busy: string;
  onManualSubmit: (body: Record<string, unknown>) => Promise<void>;
  onApprove: (ticket: TicketDetail, decision: "approve" | "reject", comment: string) => Promise<void>;
  onQuickRelease: (ticket: TicketDetail, reason: string) => Promise<void>;
  onResubmit: (ticket: TicketDetail, description: string) => Promise<void>;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <div className="grid gap-4">
        <ManualReport actorId={actorId} busy={busy} onSubmit={onManualSubmit} />
        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">Ticket Queue</p>
              <h2 className="mt-1 text-lg font-semibold">异常工单列表</h2>
            </div>
            <div className="grid flex-1 gap-2 md:grid-cols-7">
              <Input label="关键字" value={filters.q} onChange={(value) => onFiltersChange({ ...filters, q: value })} />
              <Input label="运单号" value={filters.waybillNo} onChange={(value) => onFiltersChange({ ...filters, waybillNo: value })} />
              <Select label="状态" value={filters.status} onChange={(value) => onFiltersChange({ ...filters, status: value })} options={STATUS_OPTIONS} />
              <Select
                label="类型"
                value={filters.category}
                onChange={(value) => onFiltersChange({ ...filters, category: value })}
                options={[
                  { value: "", label: "全部类型" },
                  { value: "logistics", label: "物流异常" },
                  { value: "quality", label: "品控异常" },
                ]}
              />
              <Select
                label="异常"
                value={filters.exceptionType}
                onChange={(value) => onFiltersChange({ ...filters, exceptionType: value })}
                options={EXCEPTION_OPTIONS}
              />
              <Select
                label="审批人"
                value={filters.assigneeId}
                onChange={(value) => onFiltersChange({ ...filters, assigneeId: value })}
                options={[
                  { value: "", label: "全部审批人" },
                  ...users.map((user) => ({ value: user.id, label: user.name })),
                ]}
              />
              <div className="flex items-end">
                <ActionButton onClick={onSearch} icon={<Search className="h-4 w-4" />}>
                  查询
                </ActionButton>
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded border border-[var(--line)] bg-white">
            <table className="min-w-[1120px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <Th>工单号</Th>
                  <Th>来源</Th>
                  <Th>异常</Th>
                  <Th>运单</Th>
                  <Th>金额</Th>
                  <Th>状态</Th>
                  <Th>当前审批人</Th>
                  <Th>截止时间</Th>
                </tr>
              </thead>
              <tbody>
                {tickets.items.length ? (
                  tickets.items.map((ticket) => (
                    <tr key={ticket.id} onClick={() => void onSelect(ticket.id)} className="cursor-pointer odd:bg-white even:bg-slate-50/70 hover:bg-cyan-50/50">
                      <Td>
                        <span className="font-semibold text-slate-900">{ticket.ticketNo}</span>
                      </Td>
                      <Td>
                        <Badge tone={ticket.category === "quality" ? "amber" : "blue"}>{ticket.source === "scan" ? "扫描触发" : "手工上报"}</Badge>
                      </Td>
                      <Td>{EXCEPTION_LABELS[ticket.exceptionType]}</Td>
                      <Td>{ticket.waybillNo}</Td>
                      <Td>{formatAmount(ticket.amount)}</Td>
                      <Td>
                        <Badge tone={ticket.status === "completed" ? "green" : ticket.status === "rejected" ? "red" : "cyan"}>{STATUS_LABELS[ticket.status]}</Badge>
                      </Td>
                      <Td>{ticket.currentAssigneeName || "-"}</Td>
                      <Td>
                        <span className={isNearDeadline(ticket.nextDeadlineAt) ? "font-semibold text-amber-700" : ""}>{formatTime(ticket.nextDeadlineAt)}</span>
                      </Td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                      暂无工单。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-[var(--muted)]">
            <span>共 {tickets.total} 条，第 {tickets.page} 页</span>
            <div className="flex gap-2">
              <button type="button" disabled={tickets.page <= 1} onClick={() => void onPage(tickets.page - 1)} className="rounded border border-[var(--line)] bg-white px-3 py-1.5 disabled:opacity-50">
                上一页
              </button>
              <button type="button" disabled={tickets.page * tickets.pageSize >= tickets.total} onClick={() => void onPage(tickets.page + 1)} className="rounded border border-[var(--line)] bg-white px-3 py-1.5 disabled:opacity-50">
                下一页
              </button>
            </div>
          </div>
        </Panel>
      </div>
      <TicketDetailPanel ticket={selectedTicket} busy={busy} onApprove={onApprove} onQuickRelease={onQuickRelease} onResubmit={onResubmit} />
    </section>
  );
}

function ManualReport({ actorId, busy, onSubmit }: { actorId: string; busy: string; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({ waybillNo: "", exceptionType: "lost" as LogisticsExceptionType, amount: "", description: "" });
  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <Input label="运单号" value={form.waybillNo} onChange={(value) => setForm((prev) => ({ ...prev, waybillNo: value }))} />
        </div>
        <Select label="异常类型" value={form.exceptionType} onChange={(value) => setForm((prev) => ({ ...prev, exceptionType: value as LogisticsExceptionType }))} options={LOGISTICS_EXCEPTION_OPTIONS} />
        <Input label="涉及金额" type="number" value={form.amount} onChange={(value) => setForm((prev) => ({ ...prev, amount: value }))} />
        <div className="min-w-[220px] flex-1">
          <Input label="描述" value={form.description} onChange={(value) => setForm((prev) => ({ ...prev, description: value }))} />
        </div>
        <PrimaryButton
          disabled={busy === "manual"}
          onClick={() => onSubmit({ ...form, amount: Number(form.amount || 0), reporterId: actorId })}
          icon={busy === "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />}
        >
          上报异常
        </PrimaryButton>
      </div>
    </Panel>
  );
}

function TicketDetailPanel({
  ticket,
  busy,
  onApprove,
  onQuickRelease,
  onResubmit,
}: {
  ticket: TicketDetail | null;
  busy: string;
  onApprove: (ticket: TicketDetail, decision: "approve" | "reject", comment: string) => Promise<void>;
  onQuickRelease: (ticket: TicketDetail, reason: string) => Promise<void>;
  onResubmit: (ticket: TicketDetail, description: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  if (!ticket) {
    return (
      <Panel>
        <div className="flex h-80 items-center justify-center text-center text-sm text-[var(--muted)]">选择一条工单查看状态变更、审批意见、赔付和库存联动记录。</div>
      </Panel>
    );
  }
  const sourceText = ticket.waybill?.source === "local_cache" ? `本地缓存，同步于 ${formatTime(ticket.waybill.syncedAt)}` : `实时获取自 V2，同步于 ${formatTime(ticket.waybill?.syncedAt)}`;
  const canApprove = ticket.status === "level1_review" || ticket.status === "level2_review";
  const canQuickRelease = ticket.category === "quality" && ticket.status !== "completed" && ticket.status !== "closed";
  const canResubmit = ticket.status === "rejected";
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Ticket Detail</p>
          <h2 className="mt-1 break-all text-lg font-semibold">{ticket.ticketNo}</h2>
        </div>
        <Badge tone={ticket.category === "quality" ? "amber" : "blue"}>{ticket.category === "quality" ? "品控" : "物流"}</Badge>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <InfoLine label="状态" value={STATUS_LABELS[ticket.status]} />
        <InfoLine label="异常" value={EXCEPTION_LABELS[ticket.exceptionType]} />
        <InfoLine label="运单" value={ticket.waybillNo} />
        <InfoLine label="金额" value={formatAmount(ticket.amount)} />
        <InfoLine label="审批人" value={ticket.currentAssigneeName || "-"} />
        <InfoLine label="数据来源" value={sourceText} />
      </div>
      <div className="mt-4 rounded border border-[var(--line)] bg-slate-50 p-3 text-sm leading-6">{ticket.description}</div>
      <div className="mt-4 grid gap-2">
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} className="h-20 resize-none rounded border border-[var(--line-strong)] px-3 py-2 text-sm outline-none" placeholder="审批意见 / 复核原因 / 重提说明" />
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton
            disabled={!comment || !canApprove || busy.startsWith("approve")}
            onClick={() => {
              if (window.confirm("确认通过该工单？")) void onApprove(ticket, "approve", comment);
            }}
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            通过
          </PrimaryButton>
          <DangerButton
            disabled={!comment || !canApprove || busy.startsWith("approve")}
            onClick={() => {
              if (window.confirm("确认驳回该工单？")) void onApprove(ticket, "reject", comment);
            }}
            icon={<XCircle className="h-4 w-4" />}
          >
            驳回
          </DangerButton>
          <ActionButton
            disabled={!comment || busy === "quickRelease" || !canQuickRelease}
            onClick={() => {
              if (window.confirm("确认执行品控误判快速放行？该操作会解锁批次并关闭工单。")) void onQuickRelease(ticket, comment);
            }}
            icon={<Unlock className="h-4 w-4" />}
          >
            快速放行
          </ActionButton>
          <ActionButton
            disabled={!comment || busy === "resubmit" || !canResubmit}
            onClick={() => {
              if (window.confirm("确认重新提交该工单？")) void onResubmit(ticket, comment);
            }}
            icon={<ArrowUpRight className="h-4 w-4" />}
          >
            重提
          </ActionButton>
        </div>
      </div>
      <DetailSection title="审批记录">
        {ticket.approvals.length ? ticket.approvals.map((item) => <TimelineItem key={item.id} title={`${item.actorName || item.actorId} · ${item.action}`} text={`${item.fromStatus} → ${item.toStatus}：${item.comment}`} time={item.createdAt} />) : <EmptyText text="暂无审批记录" />}
      </DetailSection>
      <DetailSection title="赔付记录">
        {ticket.compensations.length ? ticket.compensations.map((item) => <TimelineItem key={item.id} title={item.direction === "customer_compensation" ? "赔付给客户" : "向供应商追偿"} text={`${formatAmount(item.amount)} · 审批记录 ${item.approvalRecordId.slice(0, 8)}`} time={item.createdAt} />) : <EmptyText text="暂无赔付记录" />}
      </DetailSection>
      <DetailSection title="库存与扫描">
        {ticket.inventoryMovements.map((item) => <TimelineItem key={item.id} title={item.movementType} text={`${item.skuCode}/${item.batchNo} · 数量 ${item.quantityDelta}`} time={item.createdAt} />)}
        {ticket.scans.map((item) => <TimelineItem key={item.id} title={`扫描 ${item.judgement}`} text={`${item.skuCode}/${item.batchNo} · ${item.batchLockStatus}`} time={item.createdAt} />)}
        {!ticket.inventoryMovements.length && !ticket.scans.length ? <EmptyText text="暂无库存或扫描记录" /> : null}
      </DetailSection>
    </Panel>
  );
}

function RulesPanel({
  rules,
  onReload,
  busy,
  setBusy,
  setMessage,
}: {
  rules: RuleResponse;
  onReload: () => Promise<void>;
  busy: string;
  setBusy: (value: string) => void;
  setMessage: (value: string) => void;
}) {
  async function saveRule(kind: "approval" | "quality", payload: Record<string, unknown>) {
    setBusy(`save-${kind}`);
    setMessage("");
    try {
      await fetchJson("/api/v3/rules", { method: "PUT", body: JSON.stringify({ kind, ...payload }) });
      await onReload();
      setMessage("规则已保存。后续新建或流转工单会按新规则执行。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存规则失败");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <Panel>
        <h2 className="text-lg font-semibold">分级审批规则</h2>
        <div className="mt-4 grid gap-3">
          {rules.approvalRules.map((rule) => (
            <EditableApprovalRule key={rule.id} rule={rule} busy={busy} onSave={(payload) => saveRule("approval", payload)} />
          ))}
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">品控触发规则</h2>
        <div className="mt-4 grid gap-3">
          {rules.qualityRules.map((rule) => (
            <EditableQualityRule key={rule.id} rule={rule} busy={busy} onSave={(payload) => saveRule("quality", payload)} />
          ))}
        </div>
      </Panel>
    </section>
  );
}

function EditableApprovalRule({ rule, busy, onSave }: { rule: ApprovalRule; busy: string; onSave: (payload: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState({
    minAmount: String(rule.minAmount),
    maxAmount: rule.maxAmount === null ? "" : String(rule.maxAmount),
    targetLevel: String(rule.targetLevel),
    level1TimeoutHours: String(rule.level1TimeoutHours),
    level2TimeoutHours: String(rule.level2TimeoutHours),
    enabled: rule.enabled,
  });
  return (
    <div className="rounded border border-[var(--line)] bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{rule.name}</p>
          <p className="text-xs text-[var(--muted)]">{rule.category}</p>
        </div>
        <Badge tone={draft.enabled ? "green" : "red"}>{draft.enabled ? "启用" : "停用"}</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Input label="最小金额" type="number" value={draft.minAmount} onChange={(value) => setDraft((prev) => ({ ...prev, minAmount: value }))} />
        <Input label="最大金额" type="number" value={draft.maxAmount} onChange={(value) => setDraft((prev) => ({ ...prev, maxAmount: value }))} />
        <Input label="目标层级" type="number" value={draft.targetLevel} onChange={(value) => setDraft((prev) => ({ ...prev, targetLevel: value }))} />
        <Input label="一级超时 h" type="number" value={draft.level1TimeoutHours} onChange={(value) => setDraft((prev) => ({ ...prev, level1TimeoutHours: value }))} />
        <Input label="二级超时 h" type="number" value={draft.level2TimeoutHours} onChange={(value) => setDraft((prev) => ({ ...prev, level2TimeoutHours: value }))} />
        <label className="flex items-end gap-2 text-sm">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))} />
          启用
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <ActionButton
          disabled={busy === "save-approval"}
          onClick={() =>
            onSave({
              id: rule.id,
              minAmount: Number(draft.minAmount),
              maxAmount: draft.maxAmount ? Number(draft.maxAmount) : null,
              targetLevel: Number(draft.targetLevel),
              level1TimeoutHours: Number(draft.level1TimeoutHours),
              level2TimeoutHours: Number(draft.level2TimeoutHours),
              enabled: draft.enabled,
            })
          }
          icon={<Settings2 className="h-4 w-4" />}
        >
          保存
        </ActionButton>
      </div>
    </div>
  );
}

function EditableQualityRule({ rule, busy, onSave }: { rule: QualityRule; busy: string; onSave: (payload: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState({
    severity: rule.severity,
    targetLevel: String(rule.targetApprovalLevel),
    operator: rule.condition.operator,
    value: String(rule.condition.value),
    enabled: rule.enabled,
    priority: String(rule.priority),
  });
  const isBooleanMetric = rule.condition.metric === "label_matched";
  return (
    <div className="rounded border border-[var(--line)] bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{rule.name}</p>
          <p className="text-xs text-[var(--muted)]">{rule.condition.metric}</p>
        </div>
        <Badge tone={rule.severity === "high" ? "red" : "amber"}>{rule.severity}</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Select
          label="严重度"
          value={draft.severity}
          onChange={(value) => setDraft((prev) => ({ ...prev, severity: value as QualityRule["severity"] }))}
          options={[
            { value: "low", label: "low" },
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
          ]}
        />
        <Input label="目标层级" type="number" value={draft.targetLevel} onChange={(value) => setDraft((prev) => ({ ...prev, targetLevel: value }))} />
        <Input label="优先级" type="number" value={draft.priority} onChange={(value) => setDraft((prev) => ({ ...prev, priority: value }))} />
        <Select
          label="操作符"
          value={draft.operator}
          onChange={(value) => setDraft((prev) => ({ ...prev, operator: value as QualityRule["condition"]["operator"] }))}
          options={[
            { value: ">=", label: ">=" },
            { value: ">", label: ">" },
            { value: "<=", label: "<=" },
            { value: "<", label: "<" },
            { value: "=", label: "=" },
          ]}
        />
        <Input label="阈值" value={draft.value} onChange={(value) => setDraft((prev) => ({ ...prev, value }))} />
        <label className="flex items-end gap-2 text-sm">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))} />
          启用
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <ActionButton
          disabled={busy === "save-quality"}
          onClick={() =>
            onSave({
              id: rule.id,
              severity: draft.severity,
              targetLevel: Number(draft.targetLevel),
              condition: {
                metric: rule.condition.metric,
                operator: draft.operator,
                value: isBooleanMetric ? draft.value === "true" : Number(draft.value),
              },
              enabled: draft.enabled,
              priority: Number(draft.priority),
            })
          }
          icon={<Settings2 className="h-4 w-4" />}
        >
          保存
        </ActionButton>
      </div>
    </div>
  );
}

function SyncPanel({ data, onReload }: { data: SyncResponse; onReload: () => void }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">V2 Integration</p>
          <h2 className="mt-1 text-lg font-semibold">接口同步监控</h2>
        </div>
        <ActionButton onClick={onReload} icon={<RefreshCw className="h-4 w-4" />}>
          刷新日志
        </ActionButton>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Metric label="最近同步" value={formatTime(data.summary.lastSyncAt)} icon={<History className="h-4 w-4" />} />
        <Metric label="成功率" value={`${data.summary.successRate}%`} icon={<CheckCircle2 className="h-4 w-4" />} />
        <Metric label="日志条数" value={String(data.summary.total)} icon={<Database className="h-4 w-4" />} />
      </div>
      <div className="mt-4 overflow-x-auto rounded border border-[var(--line)] bg-white">
        <table className="min-w-[980px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <Th>时间</Th>
              <Th>Request ID</Th>
              <Th>接口</Th>
              <Th>状态码</Th>
              <Th>耗时</Th>
              <Th>结果</Th>
            </tr>
          </thead>
          <tbody>
            {data.logs.map((log) => (
              <tr key={log.id} className="odd:bg-white even:bg-slate-50/70">
                <Td>{formatTime(log.createdAt)}</Td>
                <Td>
                  <code className="text-xs">{log.requestId}</code>
                </Td>
                <Td>{log.endpoint}</Td>
                <Td>{log.responseStatus || "-"}</Td>
                <Td>{log.durationMs} ms</Td>
                <Td>
                  <Badge tone={log.success ? "green" : "red"}>{log.success ? "成功" : log.errorMessage || "失败"}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">{children}</div>;
}

function FlowNode({ icon, title, text, tone }: { icon: ReactNode; title: string; text: string; tone: "cyan" | "amber" | "blue" | "green" }) {
  const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" : tone === "blue" ? "bg-blue-50 text-blue-700 border-blue-200" : tone === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-cyan-50 text-cyan-700 border-cyan-200";
  return (
    <div className={`rounded border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-xs leading-5">{text}</p>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded border border-[var(--line)] bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="text-[var(--accent)]">{icon}</span>
        {label}
      </div>
      <p className="mt-2 truncate text-xl font-semibold">{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded border border-[var(--line-strong)] bg-white px-3 text-sm outline-none" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded border border-[var(--line-strong)] bg-white px-3 text-sm outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-[var(--line)] pb-2">
      <span className="shrink-0 text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 grid gap-2">{children}</div>
    </section>
  );
}

function TimelineItem({ title, text, time }: { title: string; text: string; time: string }) {
  return (
    <div className="rounded border border-[var(--line)] bg-white px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className="shrink-0 text-xs text-[var(--muted)]">{formatTime(time)}</span>
      </div>
      <p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">{text}</p>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded border border-dashed border-[var(--line)] px-3 py-4 text-center text-sm text-[var(--muted)]">{text}</p>;
}

function Badge({ children, tone }: { children: ReactNode; tone: "cyan" | "amber" | "blue" | "green" | "red" }) {
  const className =
    tone === "red"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : tone === "blue"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : tone === "green"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-cyan-50 text-cyan-700 border-cyan-200";
  return <span className={`inline-flex max-w-full items-center rounded border px-2 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function ActionButton({ children, icon, onClick, disabled = false }: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-9 items-center justify-center gap-2 rounded border border-[var(--line)] bg-white px-3 text-sm font-semibold hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50">
      {icon}
      {children}
    </button>
  );
}

function PrimaryButton({ children, icon, onClick, disabled = false }: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-9 items-center justify-center gap-2 rounded bg-[var(--accent)] px-3 text-sm font-semibold text-white hover:bg-[var(--accent-dark)] disabled:cursor-not-allowed disabled:opacity-50">
      {icon}
      {children}
    </button>
  );
}

function DangerButton({ children, icon, onClick, disabled = false }: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-9 items-center justify-center gap-2 rounded bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
      {icon}
      {children}
    </button>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="sticky top-0 z-10 border-b border-r border-[var(--line)] bg-[#f7f9fb] px-3 py-3 text-left text-sm font-semibold text-slate-900">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="border-b border-r border-[var(--line)] px-3 py-2.5 align-middle">{children}</td>;
}
