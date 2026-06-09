import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Headphones,
  Home,
  Languages,
  LogOut,
  MessageSquare,
  Mic,
  Moon,
  PhoneCall,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Ticket,
  Trash2,
  UserCheck,
  Users,
  Wand2,
} from "lucide-react";
import "./styles.css";

type Role = "admin" | "employee";
type ThemeMode = "light" | "dark";
type VoiceMode = "economy" | "realtime";
type View =
  | "overview"
  | "employees"
  | "knowledge"
  | "ai"
  | "logs"
  | "tickets"
  | "inbox"
  | "performance";

type Employee = {
  id: number;
  name: string;
  email: string;
  department: string;
  language: string;
  status: "available" | "busy" | "offline";
  handled: number;
  rating: number;
};

type KnowledgeItem = {
  id: number;
  title: string;
  category: string;
  language: string;
  content: string;
};

type Conversation = {
  id: string;
  customer: string;
  topic: string;
  language: string;
  sentiment: string;
  status: "AI Resolved" | "Transferred" | "Waiting" | "Open";
  owner: string;
  duration: string;
  summary: string;
};

type TicketItem = {
  id: string;
  title: string;
  priority: "High" | "Medium" | "Low";
  owner: string;
  due: string;
  status: "Open" | "In Progress" | "Closed";
};

type AiMessage = {
  role: "user" | "assistant";
  text: string;
  source?: string;
};

const initialEmployees: Employee[] = [
  { id: 1, name: "Nora Alharbi", email: "nora@callai.local", department: "Billing", language: "Arabic / English", status: "available", handled: 42, rating: 4.9 },
  { id: 2, name: "Faisal Khan", email: "faisal@callai.local", department: "Technical Support", language: "English / Arabic", status: "busy", handled: 37, rating: 4.7 },
  { id: 3, name: "Maha Saleh", email: "maha@callai.local", department: "Sales", language: "Saudi Arabic", status: "available", handled: 31, rating: 4.8 },
  { id: 4, name: "Omar Reed", email: "omar@callai.local", department: "Retention", language: "English", status: "offline", handled: 18, rating: 4.5 },
];

const initialKnowledge: KnowledgeItem[] = [
  {
    id: 1,
    title: "Business Hours",
    category: "General",
    language: "English",
    content: "Support is available from Sunday to Thursday, 9:00 AM to 6:00 PM Riyadh time. Emergency callbacks can be scheduled after hours.",
  },
  {
    id: 2,
    title: "Billing Policy",
    category: "Billing",
    language: "Arabic / English",
    content: "Customers can request invoice copies or billing-profile updates using their account number. Unclear amount disputes must be transferred to a billing employee.",
  },
  {
    id: 3,
    title: "Technical Escalation",
    category: "Technical Support",
    language: "English",
    content: "If the customer reports an outage, login failure, API failure, or data loss, collect account ID, service name, error time, and transfer to technical support.",
  },
  {
    id: 4,
    title: "Dialect and Tone Rules",
    category: "AI Behavior",
    language: "Arabic / English",
    content: "The assistant responds naturally in the customer's language, supports clear Arabic dialects when needed, keeps answers concise, and never invents facts outside the knowledge base.",
  },
];

const initialConversations: Conversation[] = [
  { id: "CL-1048", customer: "Abdullah M.", topic: "Invoice clarification", language: "Arabic - Saudi", sentiment: "Calm", status: "AI Resolved", owner: "AI Agent", duration: "04:18", summary: "Explained billing copy request and confirmed account verification." },
  { id: "CL-1049", customer: "Sarah P.", topic: "API outage", language: "English", sentiment: "Urgent", status: "Transferred", owner: "Faisal Khan", duration: "07:41", summary: "AI collected error time and account ID, then escalated to support." },
  { id: "CL-1050", customer: "Khaled A.", topic: "Upgrade plan", language: "Arabic - Gulf", sentiment: "Positive", status: "Waiting", owner: "Maha Saleh", duration: "02:03", summary: "Customer asked for a custom plan not covered by knowledge base." },
  { id: "CL-1051", customer: "Mina R.", topic: "Refund request", language: "English", sentiment: "Frustrated", status: "Open", owner: "Nora Alharbi", duration: "05:52", summary: "Refund policy needs manual confirmation by billing employee." },
];

const initialTickets: TicketItem[] = [
  { id: "TK-230", title: "Verify refund eligibility", priority: "High", owner: "Nora Alharbi", due: "Today 15:30", status: "In Progress" },
  { id: "TK-231", title: "Follow up on API outage", priority: "High", owner: "Faisal Khan", due: "Today 16:00", status: "Open" },
  { id: "TK-232", title: "Send enterprise quote", priority: "Medium", owner: "Maha Saleh", due: "Tomorrow 10:00", status: "Open" },
];

const statusLabels: Record<Employee["status"], string> = {
  available: "Available",
  busy: "Busy",
  offline: "Offline",
};

const navItems: Array<{ id: View; label: string; icon: typeof Home; roles: Role[] }> = [
  { id: "overview", label: "Overview", icon: Home, roles: ["admin"] },
  { id: "employees", label: "Employees", icon: Users, roles: ["admin"] },
  { id: "knowledge", label: "Customer Data", icon: BookOpen, roles: ["admin"] },
  { id: "ai", label: "AI Console", icon: Bot, roles: ["admin"] },
  { id: "logs", label: "Call Logs", icon: PhoneCall, roles: ["admin", "employee"] },
  { id: "tickets", label: "Tickets", icon: Ticket, roles: ["admin", "employee"] },
  { id: "inbox", label: "Employee Inbox", icon: MessageSquare, roles: ["employee"] },
  { id: "performance", label: "Performance", icon: BarChart3, roles: ["employee"] },
];

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("callai-theme");
    return saved === "dark" || saved === "light" ? saved : "light";
  });
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>(initialKnowledge);
  const [conversations] = useState<Conversation[]>(initialConversations);
  const [tickets] = useState<TicketItem[]>(initialTickets);

  const activeRole = role ?? "admin";
  const activeView = role === "employee" && view === "overview" ? "inbox" : view;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("callai-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  function login(nextRole: Role) {
    setRole(nextRole);
    setView(nextRole === "admin" ? "overview" : "inbox");
  }

  function logout() {
    setRole(null);
    setView("overview");
  }

  if (!role) {
    return <LoginScreen onLogin={login} theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <div className="appShell">
      <Header onHome={() => setView(activeRole === "admin" ? "overview" : "inbox")} onLogout={logout} role={role} theme={theme} onToggleTheme={toggleTheme} />
      <div className="workspace">
        <Sidebar role={role} view={activeView} onChange={(next) => setView(next)} />
        <main className="mainPanel">
          {activeView === "overview" && (
            <AdminOverview employees={employees} conversations={conversations} tickets={tickets} />
          )}
          {activeView === "employees" && (
            <EmployeesPanel employees={employees} onAdd={(employee) => setEmployees((items) => [employee, ...items])} onDelete={(id) => setEmployees((items) => items.filter((item) => item.id !== id))} />
          )}
          {activeView === "knowledge" && <CustomerDataPanel />}
          {activeView === "ai" && <AiConsole knowledge={knowledge} />}
          {activeView === "logs" && <LogsPanel conversations={conversations} />}
          {activeView === "tickets" && <TicketsPanel tickets={tickets} />}
          {activeView === "inbox" && <InboxPanel conversations={conversations} />}
          {activeView === "performance" && <PerformancePanel employees={employees} />}
        </main>
      </div>
    </div>
  );
}

function ThemeToggle({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  const Icon = theme === "light" ? Moon : Sun;
  return (
    <button className="ghostButton" onClick={onToggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
      <Icon size={17} />
      {theme === "light" ? "Dark" : "Light"}
    </button>
  );
}

function Header({ onHome, onLogout, role, theme, onToggleTheme }: { onHome: () => void; onLogout: () => void; role: Role; theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <header className="appHeader">
      <div className="brandCluster">
        <button className="logoButton" onClick={onHome} aria-label="Go to homepage">
          <img src="/logo.png" alt="AI Broker logo" className="brandLogo" />
        </button>
        <div className="brandText">
          <button className="projectName" onClick={onHome}>AI Broker</button>
          <a className="subtitleLink" href="https://www.muslimalramadan71.com/" target="_blank" rel="noreferrer">By Muslim Solutions</a>
        </div>
      </div>
      <div className="headerActions">
        <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        <button className="ghostButton" onClick={onLogout}><LogOut size={17} /> Logout</button>
      </div>
    </header>
  );
}

function LoginScreen({ onLogin, theme, onToggleTheme }: { onLogin: (role: Role) => void; theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <div className="loginScreen">
      <HeaderPreview theme={theme} onToggleTheme={onToggleTheme} />
      <section className="loginGrid">
        <div className="loginIntro">
          <span className="eyebrow">AI Broker operations portal</span>
          <h1>Secure customer service workspace for AI-assisted teams.</h1>
          <p>
            Review live calls, customer context, tickets, employee load, and voice AI controls from one clean employee-ready system.
          </p>
          <div className="loginHighlights" aria-label="System readiness">
            <div><Bot size={18} /><strong>Realtime AI</strong><span>Arabic and English voice operations</span></div>
            <div><UserCheck size={18} /><strong>Human handoff</strong><span>Clear ownership for escalations</span></div>
            <div><Ticket size={18} /><strong>Service control</strong><span>Calls, tickets, and customer data</span></div>
          </div>
        </div>
        <div className="loginCard">
          <img src="/logo.png" alt="AI Broker logo" className="loginLogo" />
          <div>
            <h2>Sign in to AI Broker</h2>
            <p>Choose the correct workspace for final operational review.</p>
          </div>
          <div className="loginFields">
            <label>Email<input value="admin@aibroker.local" readOnly /></label>
            <label>Password<input value="••••••••••" readOnly type="password" /></label>
          </div>
          <button className="primaryButton" onClick={() => onLogin("admin")}><Shield size={18} /> Continue as Admin</button>
          <button className="secondaryButton" onClick={() => onLogin("employee")}><Headphones size={18} /> Continue as Employee</button>
          <small className="loginNote">Demo authentication is enabled for local delivery review.</small>
        </div>
      </section>
    </div>
  );
}

function HeaderPreview({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <header className="appHeader previewHeader">
      <div className="brandCluster">
        <img src="/logo.png" alt="" className="brandLogo" />
        <div className="brandText">
          <span className="projectName asText">AI Broker</span>
          <a className="subtitleLink" href="https://www.muslimalramadan71.com/" target="_blank" rel="noreferrer">By Muslim Solutions</a>
        </div>
      </div>
      <div className="headerActions">
        <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    </header>
  );
}

function Sidebar({ role, view, onChange }: { role: Role; view: View; onChange: (view: View) => void }) {
  const items = navItems.filter((item) => item.roles.includes(role));
  return (
    <aside className="sidebar">
      <div className="sidebarTitle">
        <span>Workspace</span>
        <small>{role === "admin" ? "Admin workspace" : "Employee workspace"}</small>
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} className={`navItem ${view === item.id ? "active" : ""}`} onClick={() => onChange(item.id as View)}>
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </aside>
  );
}

function AdminOverview({ employees, conversations, tickets }: { employees: Employee[]; conversations: Conversation[]; tickets: TicketItem[] }) {
  const transferred = conversations.filter((item) => item.status === "Transferred" || item.status === "Waiting").length;
  const openTickets = tickets.filter((ticket) => ticket.status !== "Closed").length;
  return (
    <section className="pageStack">
      <PageTitle icon={Activity} title="Overview" description="Operational command center for AI containment, employee load, escalations, and service quality." />
      <div className="metricGrid">
        <Metric icon={PhoneCall} label="Calls Today" value="128" tone="blue" detail="+18% vs yesterday" />
        <Metric icon={Bot} label="AI Resolution" value="71%" tone="green" detail="91 calls contained" />
        <Metric icon={ChevronLeft} label="Human Handoffs" value={`${transferred}`} tone="amber" detail="routed by intent" />
        <Metric icon={Clock} label="Avg Handle Time" value="5:24" tone="ink" detail="AI + human" />
      </div>
      <section className="surface">
        <SectionHeader title="Workspace Readiness" action="Final delivery" />
        <div className="readinessGrid">
          <Signal icon={CheckCircle2} title="Queue is actionable" text="Every transferred call has an owner, summary, language, and next step." />
          <Signal icon={Shield} title="Verification is enforced" text="Sensitive customer data remains locked behind National ID and PIN checks." />
          <Signal icon={Ticket} title="Follow-ups are tracked" text={`${openTickets} tickets are open and ready for employee ownership.`} />
        </div>
      </section>
      <div className="twoColumn">
        <section className="surface">
          <SectionHeader title="Employee Availability" action={`${employees.filter((employee) => employee.status === "available").length} available`} />
          <div className="employeeList compact">
            {employees.map((employee) => <EmployeeRow key={employee.id} employee={employee} />)}
          </div>
        </section>
        <section className="surface">
          <SectionHeader title="Quality Signals" action="This week" />
          <div className="signalList">
            <Signal icon={CheckCircle2} title="AI follows knowledge grounding" text="Unknown requests are routed to employees instead of being answered with guesses." />
            <Signal icon={AlertTriangle} title="Billing needs more articles" text="Refund and invoice-dispute questions triggered the highest transfer rate." />
            <Signal icon={Ticket} title="Follow-ups are visible" text={`${openTickets} active tickets need ownership today.`} />
          </div>
        </section>
      </div>
      <LogsPanel conversations={conversations} embedded />
    </section>
  );
}

function EmployeesPanel({ employees, onAdd, onDelete }: { employees: Employee[]; onAdd: (employee: Employee) => void; onDelete: (id: number) => void }) {
  const [form, setForm] = useState({ name: "", email: "", department: "Technical Support", language: "Arabic / English" });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    onAdd({ id: Date.now(), ...form, status: "available", handled: 0, rating: 5 });
    setForm({ name: "", email: "", department: "Technical Support", language: "Arabic / English" });
  }

  return (
    <section className="pageStack">
      <PageTitle icon={Users} title="Employees" description="Manage team availability, departments, language coverage, and service quality from one directory." />
      <div className="twoColumn wideLeft">
        <section className="surface">
          <SectionHeader title="Team Directory" action={`${employees.length} employees`} />
          <div className="employeeList">
            {employees.map((employee) => (
              <div className="employeeCard" key={employee.id}>
                <EmployeeRow employee={employee} />
                <button className="iconButton danger" onClick={() => onDelete(employee.id)} aria-label={`Delete ${employee.name}`} title="Delete employee"><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
        </section>
        <section className="surface">
          <SectionHeader title="Add Employee" action="Admin only" />
          <form className="formStack" onSubmit={submit}>
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Employee name" /></label>
            <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="employee@company.com" /></label>
            <label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}><option>Technical Support</option><option>Billing</option><option>Sales</option><option>Retention</option></select></label>
            <label>Language<select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}><option>Arabic / English</option><option>Saudi Arabic</option><option>Gulf Arabic</option><option>English</option></select></label>
            <button className="primaryButton" type="submit"><Plus size={18} /> Add employee</button>
          </form>
        </section>
      </div>
    </section>
  );
}

function KnowledgePanel({ knowledge, onAdd }: { knowledge: KnowledgeItem[]; onAdd: (item: KnowledgeItem) => void }) {
  const [form, setForm] = useState({ title: "", category: "General", language: "Arabic", content: "" });
  const [query, setQuery] = useState("");
  const filtered = knowledge.filter((item) => `${item.title} ${item.category} ${item.content}`.toLowerCase().includes(query.toLowerCase()));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    onAdd({ id: Date.now(), ...form });
    setForm({ title: "", category: "General", language: "Arabic", content: "" });
  }

  return (
    <section className="pageStack">
      <PageTitle icon={BookOpen} title="AI Knowledge Base" description="Control the exact information the AI can use before it answers customers." />
      <div className="toolbar">
        <div className="searchBox"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search knowledge..." /></div>
        <span className="toolbarText">{knowledge.length} articles</span>
      </div>
      <div className="twoColumn wideLeft">
        <section className="knowledgeGrid">
          {filtered.map((item) => (
            <article className="knowledgeCard" key={item.id}>
              <div className="cardTop"><span>{item.category}</span><small>{item.language}</small></div>
              <h3>{item.title}</h3>
              <p>{item.content}</p>
            </article>
          ))}
        </section>
        <section className="surface">
          <SectionHeader title="Add Knowledge" action="Grounded AI" />
          <form className="formStack" onSubmit={submit}>
            <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Article title" /></label>
            <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>General</option><option>Billing</option><option>Technical Support</option><option>Sales</option><option>AI Behavior</option></select></label>
            <label>Language<select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}><option>Arabic</option><option>English</option><option>Arabic / English</option></select></label>
            <label>Content<textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="The exact information AI may use..." /></label>
            <button className="primaryButton" type="submit"><Plus size={18} /> Add article</button>
          </form>
        </section>
      </div>
    </section>
  );
}

function CustomerDataPanel() {
  const demoCustomers = [
    {
      name: "Abdullah Salem",
      nationalId: "******7890",
      pin: "****",
      account: "SA-001-4581",
      balance: "18,750.40 SAR",
      card: "Active",
      transactions: ["Salary deposit: 12,000 SAR", "Grocery payment: 248.90 SAR", "Telecom bill: 89 SAR"],
    },
    {
      name: "Maha Alharbi",
      nationalId: "******5566",
      pin: "****",
      account: "SA-002-7720",
      balance: "6,420.15 SAR",
      card: "Active",
      transactions: ["ATM withdrawal: 500 SAR", "Online purchase: 319 SAR", "Transfer received: 1,000 SAR"],
    },
  ];

  return (
    <section className="pageStack">
      <PageTitle icon={BookOpen} title="Customer Data" description="Verified customer records, recent activity, and safe service context for support employees." />
      <div className="toolbar">
        <div className="searchBox"><Search size={17} /><input readOnly value="" placeholder="Search customers by name, account, or case..." /></div>
        <span className="toolbarText">2 verified records</span>
      </div>
      <div className="knowledgeGrid customerGrid">
        {demoCustomers.map((customer) => (
          <article className="knowledgeCard" key={customer.account}>
            <div className="cardTop"><span>{customer.account}</span><small>{customer.card}</small></div>
            <h3>{customer.name}</h3>
            <dl className="dataList">
              <div><dt>National ID</dt><dd>{customer.nationalId}</dd></div>
              <div><dt>PIN</dt><dd>{customer.pin}</dd></div>
              <div><dt>Balance</dt><dd>{customer.balance}</dd></div>
            </dl>
            <p>Latest transactions: {customer.transactions.join("; ")}.</p>
          </article>
        ))}
      </div>
      <section className="surface">
        <SectionHeader title="Verification Flow" action="Voice agent" />
        <div className="signalList">
          <Signal icon={Shield} title="Step 1" text="Customer asks for account data, such as balance or transactions." />
          <Signal icon={UserCheck} title="Step 2" text="The system asks for National ID, then the 4-digit PIN." />
          <Signal icon={Headphones} title="Step 3" text="If verification fails three times, the call is transferred to an employee." />
        </div>
      </section>
    </section>
  );
}

function AiConsole({ knowledge }: { knowledge: KnowledgeItem[] }) {
  const [dialect, setDialect] = useState("Saudi Arabic");
  const [callState, setCallState] = useState<"idle" | "connecting" | "active" | "speaking">("idle");
  const [voiceStatus, setVoiceStatus] = useState("Realtime voice is ready.");
  const [activeModel, setActiveModel] = useState("Gemini Live");
  const [inputLevel, setInputLevel] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlaybackTimeRef = useRef(0);

  const context = useMemo(() => knowledge.map((item) => `[${item.category} / ${item.language}] ${item.title}: ${item.content}`).join("\n"), [knowledge]);
  const isCallActive = callState !== "idle";

  useEffect(() => {
    return () => stopVoiceCall();
  }, []);

  useEffect(() => {
    if (!isCallActive) {
      setSessionSeconds(0);
      return;
    }
    const interval = window.setInterval(() => {
      setSessionSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isCallActive]);

  useEffect(() => {
    if (callState === "idle") {
      setInputLevel(0);
      return;
    }
    const interval = window.setInterval(() => {
      setInputLevel((level) => Math.max(0, level * 0.78 - 0.015));
    }, 140);
    return () => window.clearInterval(interval);
  }, [callState]);

  function toBase64(bytes: Uint8Array) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  function fromBase64(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function floatToPcm16(input: Float32Array) {
    const bytes = new ArrayBuffer(input.length * 2);
    const view = new DataView(bytes);
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index]));
      view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Uint8Array(bytes);
  }

  function getAudioRate(mimeType = "audio/pcm;rate=24000") {
    const match = mimeType.match(/rate=(\d+)/);
    return match ? Number(match[1]) : 24000;
  }

  function playPcmAudio(base64: string, mimeType?: string) {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const outputContext = outputContextRef.current ?? new AudioContextCtor({ sampleRate: getAudioRate(mimeType) });
    outputContextRef.current = outputContext;

    const bytes = fromBase64(base64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buffer = outputContext.createBuffer(1, samples.length, getAudioRate(mimeType));
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }

    const source = outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputContext.destination);
    const startAt = Math.max(outputContext.currentTime + 0.025, nextPlaybackTimeRef.current);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + buffer.duration;
    source.onended = () => {
      if (outputContext.currentTime >= nextPlaybackTimeRef.current - 0.05) {
        setCallState("active");
        setVoiceStatus("Listening. Speak Arabic or English naturally.");
      }
    };
  }

  async function startVoiceCall() {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextCtor) {
      setVoiceStatus("Realtime voice needs a browser with microphone and Web Audio support.");
      return;
    }

    setCallState("connecting");
    setVoiceStatus("Connecting Gemini Live voice...");

    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${wsProtocol}//${window.location.host}/api/gemini-live`);
      socketRef.current = socket;

      socket.onopen = async () => {
        socket.send(JSON.stringify({
          type: "setup",
          dialect,
          language: "Arabic and English",
          voiceName: "Kore",
          context,
        }));

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;

        const inputContext = new AudioContextCtor();
        inputContextRef.current = inputContext;
        await inputContext.resume();

        const source = inputContext.createMediaStreamSource(stream);
        const processor = inputContext.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          const input = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let index = 0; index < input.length; index += 1) {
            sum += input[index] * input[index];
          }
          const rms = Math.sqrt(sum / input.length);
          setInputLevel(Math.min(1, rms * 12));
          const pcm = floatToPcm16(input);
          socket.send(JSON.stringify({
            type: "audio",
            data: toBase64(pcm),
            mimeType: `audio/pcm;rate=${inputContext.sampleRate}`,
          }));
        };

        source.connect(processor);
        processor.connect(inputContext.destination);
        setCallState("active");
        setVoiceStatus("Listening. Speak Arabic or English naturally.");
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "ready") {
          setActiveModel(message.model || "Gemini Live");
          setVoiceStatus("Gemini Live is connected. Start speaking.");
          return;
        }
        if (message.type === "audio") {
          setCallState("speaking");
          setVoiceStatus("AI is speaking.");
          playPcmAudio(message.data, message.mimeType);
          return;
        }
        if (message.type === "interrupted") {
          nextPlaybackTimeRef.current = outputContextRef.current?.currentTime ?? 0;
          setVoiceStatus("Listening after interruption.");
          return;
        }
        if (message.type === "error") {
          setVoiceStatus(message.message || "Gemini Live error.");
          return;
        }
        if (message.type === "closed") {
          setVoiceStatus(message.message || "Gemini Live session closed.");
        }
      };

      socket.onerror = () => {
        setVoiceStatus("Could not connect to Gemini Live.");
      };

      socket.onclose = () => {
        if (callState !== "idle") stopVoiceCall();
      };
    } catch (error) {
      stopVoiceCall();
      setVoiceStatus(error instanceof Error ? error.message : "Realtime connection failed.");
    }
  }

  function stopVoiceCall() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
      socketRef.current.close();
    }
    void inputContextRef.current?.close();
    void outputContextRef.current?.close();
    socketRef.current = null;
    mediaStreamRef.current = null;
    inputContextRef.current = null;
    outputContextRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
    nextPlaybackTimeRef.current = 0;
    setCallState("idle");
    setVoiceStatus("Realtime voice ended.");
  }

  function toggleVoiceCall() {
    if (callState !== "idle") {
      stopVoiceCall();
    } else {
      void startVoiceCall();
    }
  }

  const statusTitle = callState === "connecting" ? "Connecting..." : callState === "active" ? "Realtime call active" : callState === "speaking" ? "AI speaking..." : "Start voice call";
  const statusText = callState === "connecting" ? "Preparing the secure Gemini Live audio session." : callState === "active" ? "Speak naturally in Arabic or English. Press the microphone to end." : callState === "speaking" ? "The AI is replying by voice only." : "One tap starts a live voice-only bank call.";
  const sessionTime = `${Math.floor(sessionSeconds / 60).toString().padStart(2, "0")}:${(sessionSeconds % 60).toString().padStart(2, "0")}`;
  const meterBars = [0.22, 0.48, 0.76, 0.54, 0.34, 0.66, 0.42, 0.24];
  const visualLevel = callState === "speaking" ? 0.88 : callState === "connecting" ? 0.42 : callState === "active" ? inputLevel : 0.16;

  return (
    <section className="pageStack">
      <PageTitle icon={Bot} title="AI Console" description="Monitor the realtime voice agent, model state, language behavior, and secure verification rules." />
      <div className="aiLayout">
        <section className="surface">
          <SectionHeader title="Voice Settings" action="Gemini Live" />
          <div className="formStack">
            <label>Active model<input value={activeModel} readOnly /></label>
            <label>Languages<input value="Arabic / English" readOnly /></label>
            <label>Arabic dialect<select value={dialect} onChange={(event) => setDialect(event.target.value)}><option>Saudi Arabic</option><option>Gulf Arabic</option><option>Egyptian Arabic</option><option>Levantine Arabic</option><option>Modern Standard Arabic</option></select></label>
            <div className="ruleBox">
              <Wand2 size={18} />
              <p>Voice-only rule: the agent speaks naturally in Arabic or English and never reveals account data before National ID and PIN verification.</p>
            </div>
          </div>
        </section>
        <section className="surface voiceOnlySurface">
          <SectionHeader title="Live Voice Call" action="Gemini Live" />
          <div className={`voiceStage ${callState}`}>
            <div className="voiceOrbWrap">
              <span className="voiceRing ringOne" />
              <span className="voiceRing ringTwo" />
              <button className={`callMic ${callState}`} type="button" onClick={toggleVoiceCall} aria-pressed={isCallActive} aria-label={isCallActive ? "End voice call" : "Start voice call"}>
                <Mic size={46} />
              </button>
            </div>
            <div className="callStatus">
              <strong>{statusTitle}</strong>
              <span>{statusText}</span>
            </div>
            <div className={`liveWave ${callState}`} aria-hidden="true">
              {meterBars.map((bar, index) => (
                <span key={index} style={{ height: `${18 + Math.round(bar * visualLevel * 76)}px` }} />
              ))}
            </div>
            <div className="callMetrics" aria-label="Voice call status">
              <div><small>Connection</small><strong>{isCallActive ? "Connected" : "Standby"}</strong></div>
              <div><small>Microphone</small><strong>{callState === "active" ? "Listening" : callState === "speaking" ? "Paused" : "Ready"}</strong></div>
              <div><small>Session</small><strong>{sessionTime}</strong></div>
              <div><small>Language</small><strong>AR / EN</strong></div>
            </div>
            <div className="transcriptBox">
              <small>{callState === "speaking" ? "AI output" : callState === "active" ? "User input" : "Status"}</small>
              <p>{voiceStatus}</p>
            </div>
            {isCallActive && <button className="endCallButton" type="button" onClick={stopVoiceCall}><PhoneCall size={17} /> End call</button>}
          </div>
        </section>
      </div>
    </section>
  );
}

function LogsPanel({ conversations, embedded = false }: { conversations: Conversation[]; embedded?: boolean }) {
  return (
    <section className={embedded ? "surface" : "pageStack"}>
      {!embedded && <PageTitle icon={PhoneCall} title="Call Logs" description="Every AI answer, human transfer, sentiment, owner, and after-call summary in one place." />}
      {embedded && <SectionHeader title="Recent Calls" action="Live queue" />}
      <div className="tableWrap">
        <table>
          <thead><tr><th>ID</th><th>Customer</th><th>Topic</th><th>Language</th><th>Status</th><th>Owner</th><th>Summary</th></tr></thead>
          <tbody>
            {conversations.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.customer}</td>
                <td>{item.topic}</td>
                <td>{item.language}</td>
                <td><span className={`statusText ${item.status.replace(/\s/g, "").toLowerCase()}`}>{item.status}</span></td>
                <td>{item.owner}</td>
                <td>{item.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TicketsPanel({ tickets }: { tickets: TicketItem[] }) {
  return (
    <section className="pageStack">
      <PageTitle icon={Ticket} title="Tickets" description="Track customer callbacks, unresolved cases, owners, priorities, due times, and next action." />
      <div className="ticketGrid">
        {tickets.map((ticket) => (
          <article className="ticketCard" key={ticket.id}>
            <div className="cardTop"><span>{ticket.id}</span><small className={`priorityText ${ticket.priority.toLowerCase()}`}>{ticket.priority} priority</small></div>
            <h3>{ticket.title}</h3>
            <p>{ticket.owner}</p>
            <div className="ticketFoot"><span><Clock size={15} /> {ticket.due}</span><strong>{ticket.status}</strong></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function InboxPanel({ conversations }: { conversations: Conversation[] }) {
  const queue = conversations.filter((item) => item.status === "Transferred" || item.status === "Waiting" || item.status === "Open");
  return (
    <section className="pageStack">
      <PageTitle icon={MessageSquare} title="Employee Inbox" description="Handle transferred customers with AI summaries, intent, language, and suggested next action." />
      <div className="inboxLayout">
        <section className="surface queuePanel">
          <SectionHeader title="Waiting Queue" action={`${queue.length} active`} />
          {queue.map((item) => (
            <button className="queueItem" key={item.id}>
              <span>{item.customer}</span>
              <small>{item.topic}</small>
              <strong>{item.language}</strong>
            </button>
          ))}
        </section>
        <section className="surface customerPanel">
          <SectionHeader title="Customer Context" action="AI handoff" />
          <div className="customerHero">
            <div><h3>{queue[0]?.customer ?? "No active customer"}</h3><p>{queue[0]?.summary ?? "Queue is clear."}</p></div>
            <span className="statusText transferred">Transferred</span>
          </div>
          <div className="agentAssist">
            <h4>Suggested response</h4>
            <p>Hello, I received the context from the AI assistant. I will review the case with you now and continue without asking you to repeat the issue.</p>
          </div>
          <div className="actionRow">
            <button className="primaryButton"><CheckCircle2 size={18} /> Resolve</button>
            <button className="secondaryButton"><ChevronLeft size={18} /> Transfer</button>
          </div>
        </section>
      </div>
    </section>
  );
}

function PerformancePanel({ employees }: { employees: Employee[] }) {
  return (
    <section className="pageStack">
      <PageTitle icon={BarChart3} title="Employee Performance" description="Personal service metrics, quality trend, and workload signals." />
      <div className="metricGrid">
        <Metric icon={PhoneCall} label="Handled Calls" value="37" tone="blue" detail="Today" />
        <Metric icon={CheckCircle2} label="Resolution Rate" value="84%" tone="green" detail="Human-assisted" />
        <Metric icon={Clock} label="Avg Response" value="42s" tone="amber" detail="Queue pickup" />
        <Metric icon={Sparkles} label="Quality Score" value="4.7" tone="ink" detail="Admin review" />
      </div>
      <section className="surface">
        <SectionHeader title="Team Benchmark" action="Visible to employee" />
        <div className="employeeList">
          {employees.map((employee) => <EmployeeRow key={employee.id} employee={employee} />)}
        </div>
      </section>
    </section>
  );
}

function PageTitle({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return (
    <div className="pageTitle">
      <span><Icon size={22} /></span>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return <div className="sectionHeader"><h2>{title}</h2><span>{action}</span></div>;
}

function Metric({ icon: Icon, label, value, tone, detail }: { icon: typeof Activity; label: string; value: string; tone: string; detail: string }) {
  return (
    <article className={`metricCard ${tone}`}>
      <div><Icon size={21} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EmployeeRow({ employee }: { employee: Employee }) {
  return (
    <div className="employeeRow">
      <div className="avatar">{employee.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
      <div>
        <strong>{employee.name}</strong>
        <span>{employee.department} / {employee.language}</span>
      </div>
      <small className={`availability ${employee.status}`}>{statusLabels[employee.status]}</small>
    </div>
  );
}

function Signal({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) {
  return (
    <div className="signal">
      <Icon size={19} />
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
