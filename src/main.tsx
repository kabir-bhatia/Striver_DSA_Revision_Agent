import React from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Code2,
  ExternalLink,
  Loader2,
  MessageSquare,
  PlayCircle,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2
} from "lucide-react";
import { marked } from "marked";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./styles.css";

marked.setOptions({ breaks: true, gfm: true });

type TopicTier = "very_easy" | "easy" | "medium" | "hard" | "tricky";
type TierFilter = TopicTier | "unassigned" | "";
type AppView = "browse" | "today";

interface Section {
  id: string;
  name: string;
  problemCount: number;
  subcategories: Array<{ id: string; name: string; problemCount: number }>;
}

interface Topic {
  id: string;
  name: string;
  article?: string;
  youtube?: string;
  leetcode?: string;
  difficulty?: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  done: boolean;
  tier?: TopicTier;
  mistakeNote: string;
}

interface StudyBundle {
  problem: string;
  intuition: string;
  solution: string[];
  pythonCode: string;
  complexity: string;
  mistakes: string[];
  sourceNotes: string[];
}

interface StudyResponse {
  topic: Topic;
  resources: {
    sources: {
      articleAvailable: boolean;
      transcriptAvailable: boolean;
      article?: string;
      youtube?: string;
    };
  };
  bundle: StudyBundle;
}

interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

interface ProgressSummary {
  total: number;
  done: number;
  remaining: number;
  percentage: number;
}

interface RevisionItem {
  id: number;
  topicId: string;
  topicName: string;
  categoryName: string;
  subcategoryName: string;
  tier: TopicTier;
  stage: number;
  dueDateUtc: string;
  completedAtUtc?: string;
  createdAtUtc: string;
  mistakeNote: string;
}

interface DailyGoal {
  id: number;
  dateUtc: string;
  topicId?: string;
  topicName?: string;
  title: string;
  completedAtUtc?: string;
  position: number;
  createdAtUtc: string;
}

interface TodaySchedule {
  todayUtc: string;
  revisions: RevisionItem[];
  goals: DailyGoal[];
}

const tiers: Array<{ value: TopicTier; label: string }> = [
  { value: "very_easy", label: "Very Easy" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "tricky", label: "Tricky" }
];

function App() {
  const [view, setView] = React.useState<AppView>("browse");
  const [sections, setSections] = React.useState<Section[]>([]);
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [selectedSection, setSelectedSection] = React.useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = React.useState<string>("");
  const [selectedTopic, setSelectedTopic] = React.useState<Topic | undefined>();
  const [study, setStudy] = React.useState<StudyResponse | undefined>();
  const [chat, setChat] = React.useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [progress, setProgress] = React.useState<ProgressSummary>({
    total: 0,
    done: 0,
    remaining: 0,
    percentage: 0
  });
  const [revisions, setRevisions] = React.useState<RevisionItem[]>([]);
  const [today, setToday] = React.useState<TodaySchedule | undefined>();
  const [goalTitle, setGoalTitle] = React.useState("");
  const [noteDraft, setNoteDraft] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [tierFilter, setTierFilter] = React.useState<TierFilter>("");
  const [loadingSections, setLoadingSections] = React.useState(true);
  const [loadingTopics, setLoadingTopics] = React.useState(false);
  const [loadingStudy, setLoadingStudy] = React.useState(false);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    loadSections();
    loadToday();
  }, []);

  React.useEffect(() => {
    loadTopics();
  }, [selectedSection, selectedSubcategory, query, tierFilter]);

  React.useEffect(() => {
    if (!selectedTopic) return;
    setNoteDraft(selectedTopic.mistakeNote);
    loadSavedChat(selectedTopic.id);
    loadRevisions(selectedTopic.id);
  }, [selectedTopic?.id]);

  async function loadSections() {
    setLoadingSections(true);
    setError("");
    try {
      const data = await api<Section[]>("/api/sections");
      setSections(data);
      if (data[0]) setSelectedSection(data[0].id);
      await loadProgress();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingSections(false);
    }
  }

  async function loadTopics() {
    setLoadingTopics(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedSection) params.set("sectionId", selectedSection);
      if (selectedSubcategory) params.set("subcategoryId", selectedSubcategory);
      if (query) params.set("q", query);
      if (tierFilter) params.set("tier", tierFilter);
      const data = await api<Topic[]>(`/api/topics?${params.toString()}`);
      setTopics(data);
      if (!selectedTopic || !data.some((topic) => topic.id === selectedTopic.id)) {
        setSelectedTopic(data[0]);
        setStudy(undefined);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingTopics(false);
    }
  }

  async function syncSheet() {
    setError("");
    await api("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true })
    });
    await loadSections();
    await loadProgress();
    await loadToday();
  }

  async function loadProgress() {
    const data = await api<ProgressSummary>("/api/progress");
    setProgress(data);
  }

  async function loadToday() {
    const data = await api<TodaySchedule>("/api/schedule/today");
    setToday(data);
  }

  async function loadSavedChat(topicId: string) {
    setError("");
    try {
      const data = await api<ChatMessage[]>(`/api/topics/${topicId}/chat`);
      setChat(data);
    } catch (err) {
      setChat([]);
      setError(errorMessage(err));
    }
  }

  async function loadRevisions(topicId: string) {
    const data = await api<RevisionItem[]>(`/api/topics/${topicId}/revisions`);
    setRevisions(data);
  }

  async function openTopic(topicId: string) {
    setError("");
    try {
      const topic = await api<Topic>(`/api/topics/${topicId}`);
      setView("browse");
      setQuery("");
      setTierFilter("");
      setSelectedSection(topic.categoryId);
      setSelectedSubcategory(topic.subcategoryId);
      setSelectedTopic(topic);
      setStudy(undefined);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function loadStudy(topic = selectedTopic, force = false) {
    if (!topic) return;
    setLoadingStudy(true);
    setError("");
    setStudy(undefined);
    try {
      const data = await api<StudyResponse>(`/api/topics/${topic.id}/study`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force })
      });
      setStudy(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingStudy(false);
    }
  }

  async function updateDone(topic: Topic, done: boolean) {
    if (done && !topic.tier) {
      setError("Choose a tier first so revisions can be scheduled.");
      return;
    }
    const updated = await api<Topic>(`/api/topics/${topic.id}/done`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done })
    });
    applyTopicUpdate(updated);
    await loadProgress();
    await loadRevisions(updated.id);
    await loadToday();
  }

  async function updateTier(topic: Topic, tier: string) {
    const updated = await api<Topic>(`/api/topics/${topic.id}/tier`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier: tier || null })
    });
    applyTopicUpdate(updated);
    await loadRevisions(updated.id);
    await loadToday();
  }

  async function saveNote(topic = selectedTopic) {
    if (!topic) return;
    const updated = await api<Topic>(`/api/topics/${topic.id}/note`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: noteDraft })
    });
    applyTopicUpdate(updated);
    await loadToday();
  }

  function applyTopicUpdate(updated: Topic) {
    setTopics((items) =>
      items.map((item) => (item.id === updated.id ? updated : item))
    );
    setSelectedTopic((current) => (current?.id === updated.id ? updated : current));
  }

  async function sendChat() {
    if (!selectedTopic || !chatInput.trim()) return;
    const nextMessages: ChatMessage[] = [
      ...chat,
      { role: "user", content: chatInput.trim() }
    ];
    setChat(nextMessages);
    setChatInput("");
    setChatLoading(true);
    setError("");
    try {
      const data = await api<{ answer: string; messages: ChatMessage[] }>("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId: selectedTopic.id, messages: nextMessages })
      });
      setChat(data.messages);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChatLoading(false);
    }
  }

  async function clearChat() {
    if (!selectedTopic) return;
    setError("");
    try {
      await api(`/api/topics/${selectedTopic.id}/chat`, { method: "DELETE" });
      setChat([]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function completeRevision(id: number) {
    const data = await api<TodaySchedule>(`/api/revisions/${id}/complete`, {
      method: "POST"
    });
    setToday(data);
    if (selectedTopic) await loadRevisions(selectedTopic.id);
  }

  async function addGoal() {
    if (!goalTitle.trim() || !today) return;
    await api<DailyGoal>("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dateUtc: today.todayUtc, title: goalTitle.trim() })
    });
    setGoalTitle("");
    await loadToday();
  }

  async function addGoalFromTopic(topic: Topic) {
    if (!today) return;
    await api<DailyGoal>("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dateUtc: today.todayUtc, topicId: topic.id })
    });
    setGoalTitle("");
    await loadToday();
  }

  async function addSelectedTopicGoal() {
    if (!selectedTopic || !today) return;
    await api<DailyGoal>("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dateUtc: today.todayUtc, topicId: selectedTopic.id })
    });
    await loadToday();
  }

  async function toggleGoal(goal: DailyGoal) {
    await api<DailyGoal>(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: !goal.completedAtUtc })
    });
    await loadToday();
  }

  async function deleteGoal(goal: DailyGoal) {
    await api(`/api/goals/${goal.id}`, { method: "DELETE" });
    await loadToday();
  }

  const selectedSectionData = sections.find((section) => section.id === selectedSection);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <h1>DSA Revision</h1>
            <p>Striver A2Z tutor</p>
          </div>
          <button className="icon-button" onClick={syncSheet} title="Sync sheet">
            <RefreshCcw size={18} />
          </button>
        </div>

        <ProgressCard progress={progress} />

        <div className="view-switch">
          <button className={view === "browse" ? "active" : ""} onClick={() => setView("browse")}>
            Browse
          </button>
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>
            Today
          </button>
        </div>

        <label className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topics"
          />
        </label>

        <div className="section-list">
          {loadingSections && <InlineLoading label="Loading sheet" />}
          {sections.map((section) => (
            <button
              key={section.id}
              className={`section-button ${selectedSection === section.id ? "active" : ""}`}
              onClick={() => {
                setView("browse");
                setSelectedSection(section.id);
                setSelectedSubcategory("");
                setStudy(undefined);
              }}
            >
              <span>{section.name}</span>
              <strong>{section.problemCount}</strong>
            </button>
          ))}
        </div>
      </aside>

      <section className="topic-pane">
        {view === "browse" ? (
          <BrowseTopics
            selectedSectionData={selectedSectionData}
            selectedSubcategory={selectedSubcategory}
            setSelectedSubcategory={setSelectedSubcategory}
            topics={topics}
            selectedTopic={selectedTopic}
            setSelectedTopic={(topic) => {
              setSelectedTopic(topic);
              setStudy(undefined);
            }}
            tierFilter={tierFilter}
            setTierFilter={setTierFilter}
            loadingTopics={loadingTopics}
          />
        ) : (
          <TodayRevisions
            today={today}
            onComplete={completeRevision}
            onOpenTopic={openTopic}
          />
        )}
      </section>

      <section className="detail-pane">
        {error && <div className="error-banner">{error}</div>}

        {view === "today" ? (
          <TodayGoals
            today={today}
            goalTitle={goalTitle}
            setGoalTitle={setGoalTitle}
            addGoal={addGoal}
            addGoalFromTopic={addGoalFromTopic}
            selectedTopic={selectedTopic}
            addSelectedTopicGoal={addSelectedTopicGoal}
            toggleGoal={toggleGoal}
            deleteGoal={deleteGoal}
            openTopic={openTopic}
          />
        ) : selectedTopic ? (
          <>
            <div className="detail-header">
              <div>
                <p className="eyebrow">{selectedTopic.categoryName}</p>
                <h2>{selectedTopic.name}</h2>
                <p>{selectedTopic.subcategoryName}</p>
              </div>
              <div className="source-actions">
                {selectedTopic.article && (
                  <a href={selectedTopic.article} target="_blank" rel="noreferrer">
                    <BookOpen size={16} /> Notes <ExternalLink size={14} />
                  </a>
                )}
                {selectedTopic.youtube && (
                  <a href={selectedTopic.youtube} target="_blank" rel="noreferrer">
                    <PlayCircle size={16} /> Video <ExternalLink size={14} />
                  </a>
                )}
                {selectedTopic.leetcode && (
                  <a href={selectedTopic.leetcode} target="_blank" rel="noreferrer">
                    <Code2 size={16} /> LeetCode <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>

            <div className="control-row">
              <button
                className={`check-button ${selectedTopic.done ? "checked" : ""}`}
                onClick={() => updateDone(selectedTopic, !selectedTopic.done)}
                title="Toggle done"
              >
                {selectedTopic.done ? <Check size={18} /> : <Circle size={18} />}
                Done
              </button>
              <select
                value={selectedTopic.tier || ""}
                onChange={(event) => updateTier(selectedTopic, event.target.value)}
              >
                <option value="">Unassigned tier</option>
                {tiers.map((tier) => (
                  <option value={tier.value} key={tier.value}>
                    {tier.label}
                  </option>
                ))}
              </select>
              <button className="primary-button" onClick={() => loadStudy()}>
                {loadingStudy ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                Generate study bundle
              </button>
              <button className="icon-button" onClick={() => loadStudy(selectedTopic, true)} title="Regenerate">
                <RefreshCcw size={17} />
              </button>
            </div>

            <MistakeNotePanel
              noteDraft={noteDraft}
              setNoteDraft={setNoteDraft}
              savedNote={selectedTopic.mistakeNote}
              onSave={() => saveNote()}
            />

            <RevisionPreview revisions={revisions} />

            {loadingStudy && <StudySkeleton />}
            {study && <StudyBundleView study={study} />}

            <section className="chat-panel">
              <div className="chat-title">
                <span>
                  <MessageSquare size={18} />
                  <h3>Ask follow-ups</h3>
                </span>
                <button className="icon-button subtle" onClick={clearChat} title="Clear saved chat">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="chat-messages">
                {chat.length === 0 && (
                  <p className="empty-state">Ask for dry runs, edge cases, or interview hints.</p>
                )}
                {chat.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
                    <Md text={message.content} />
                  </div>
                ))}
                {chatLoading && <InlineLoading label="Thinking" />}
              </div>
              <div className="chat-input">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendChat();
                  }}
                  placeholder="Ask about this topic"
                />
                <button onClick={sendChat}>Send</button>
              </div>
            </section>
          </>
        ) : (
          <p className="empty-state">Pick a topic to start revising.</p>
        )}
      </section>
    </main>
  );
}

function BrowseTopics(props: {
  selectedSectionData?: Section;
  selectedSubcategory: string;
  setSelectedSubcategory: (id: string) => void;
  topics: Topic[];
  selectedTopic?: Topic;
  setSelectedTopic: (topic: Topic) => void;
  tierFilter: TierFilter;
  setTierFilter: (filter: TierFilter) => void;
  loadingTopics: boolean;
}) {
  return (
    <>
      <div className="pane-header">
        <div>
          <p className="eyebrow">Sections</p>
          <h2>{props.selectedSectionData?.name || "Loading"}</h2>
        </div>
        <span className="count-pill">{props.topics.length} topics</span>
      </div>

      <div className="subcat-row">
        <button
          className={!props.selectedSubcategory ? "active" : ""}
          onClick={() => props.setSelectedSubcategory("")}
        >
          All
        </button>
        {props.selectedSectionData?.subcategories.map((subcategory) => (
          <button
            key={subcategory.id}
            className={props.selectedSubcategory === subcategory.id ? "active" : ""}
            onClick={() => props.setSelectedSubcategory(subcategory.id)}
          >
            {subcategory.name}
          </button>
        ))}
      </div>

      <div className="tier-filter-row">
        <button className={!props.tierFilter ? "active" : ""} onClick={() => props.setTierFilter("")}>
          All tiers
        </button>
        {tiers.map((tier) => (
          <button
            key={tier.value}
            className={props.tierFilter === tier.value ? "active" : ""}
            onClick={() => props.setTierFilter(tier.value)}
          >
            {tier.label}
          </button>
        ))}
        <button
          className={props.tierFilter === "unassigned" ? "active" : ""}
          onClick={() => props.setTierFilter("unassigned")}
        >
          Unassigned
        </button>
      </div>

      <div className="topic-list">
        {props.loadingTopics && <InlineLoading label="Loading topics" />}
        {!props.loadingTopics && props.topics.length === 0 && (
          <p className="empty-state">No topics match this filter.</p>
        )}
        {props.topics.map((topic) => (
          <button
            key={topic.id}
            className={`topic-row ${props.selectedTopic?.id === topic.id ? "active" : ""}`}
            onClick={() => props.setSelectedTopic(topic)}
          >
            <span className={`row-check ${topic.done ? "checked" : ""}`}>
              {topic.done ? <Check size={13} /> : null}
            </span>
            <span>
              <strong>{topic.name}</strong>
              <small>{topic.subcategoryName}</small>
            </span>
            <em>{topic.tier ? tierLabel(topic.tier) : "Unassigned"}</em>
          </button>
        ))}
      </div>
    </>
  );
}

function TodayRevisions({
  today,
  onComplete,
  onOpenTopic
}: {
  today?: TodaySchedule;
  onComplete: (id: number) => void;
  onOpenTopic: (topicId: string) => void;
}) {
  return (
    <>
      <div className="pane-header">
        <div>
          <p className="eyebrow">UTC Schedule</p>
          <h2>Today, {today?.todayUtc ? formatDate(today.todayUtc) : "..."} UTC</h2>
        </div>
        <span className="count-pill">{today?.revisions.length || 0} due</span>
      </div>

      <div className="today-list">
        {!today && <InlineLoading label="Loading schedule" />}
        {today?.revisions.length === 0 && (
          <p className="empty-state">No due or overdue revisions for UTC today.</p>
        )}
        {today?.revisions.map((revision) => (
          <article
            className="today-card clickable"
            key={revision.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenTopic(revision.topicId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenTopic(revision.topicId);
              }
            }}
          >
            <div>
              <strong>{revision.topicName}</strong>
              <p>
                {tierLabel(revision.tier)} | Revision {revision.stage} | Due {formatDate(revision.dueDateUtc)}
              </p>
              {revision.mistakeNote && <small>{revision.mistakeNote}</small>}
            </div>
            <button
              className="secondary-button"
              onClick={(event) => {
                event.stopPropagation();
                onComplete(revision.id);
              }}
            >
              <Check size={16} /> Done
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function TodayGoals(props: {
  today?: TodaySchedule;
  goalTitle: string;
  setGoalTitle: (value: string) => void;
  addGoal: () => void;
  addGoalFromTopic: (topic: Topic) => void;
  selectedTopic?: Topic;
  addSelectedTopicGoal: () => void;
  toggleGoal: (goal: DailyGoal) => void;
  deleteGoal: (goal: DailyGoal) => void;
  openTopic: (topicId: string) => void;
}) {
  const [suggestions, setSuggestions] = React.useState<Topic[]>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = props.goalTitle.trim();
    if (!q) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api<Topic[]>(`/api/topics?q=${encodeURIComponent(q)}`);
        setSuggestions(data.slice(0, 10));
        setShowSuggestions(data.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [props.goalTitle]);

  function handleSuggestionClick(topic: Topic) {
    setShowSuggestions(false);
    setSuggestions([]);
    props.addGoalFromTopic(topic);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") setShowSuggestions(false);
    if (event.key === "Enter") {
      setShowSuggestions(false);
      props.addGoal();
    }
  }

  return (
    <section className="today-goals">
      <div className="detail-header">
        <div>
          <p className="eyebrow">UTC Daily Target</p>
          <h2>Today's Goal</h2>
          <p>{props.today?.todayUtc ? formatDate(props.today.todayUtc) : "..."} UTC</p>
        </div>
      </div>

      <div className="goal-input-wrapper" ref={wrapperRef}>
        <div className="goal-input-row">
          <input
            value={props.goalTitle}
            onChange={(event) => props.setGoalTitle(event.target.value)}
            onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder="Search topics or type a custom goal"
          />
          <button className="primary-button" onClick={() => { setShowSuggestions(false); props.addGoal(); }}>
            <Plus size={16} /> Add
          </button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="goal-suggestions">
            {suggestions.map((topic) => (
              <button
                key={topic.id}
                className="goal-suggestion-item"
                onMouseDown={() => handleSuggestionClick(topic)}
              >
                <strong>{topic.name}</strong>
                <span className="suggestion-meta">
                  {topic.categoryName} › {topic.subcategoryName}
                  {topic.tier ? ` · ${tierLabel(topic.tier)}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="secondary-button" onClick={props.addSelectedTopicGoal} disabled={!props.selectedTopic}>
        <CalendarDays size={16} />
        Add selected topic as goal
      </button>

      <div className="goal-list">
        {props.today?.goals.length === 0 && (
          <p className="empty-state">No goals added for UTC today.</p>
        )}
        {props.today?.goals.map((goal) => (
          <article
            className={`goal-row ${goal.completedAtUtc ? "done" : ""} ${goal.topicId ? "clickable" : ""}`}
            key={goal.id}
            role={goal.topicId ? "button" : undefined}
            tabIndex={goal.topicId ? 0 : undefined}
            onClick={() => {
              if (goal.topicId) props.openTopic(goal.topicId);
            }}
            onKeyDown={(event) => {
              if (!goal.topicId) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                props.openTopic(goal.topicId);
              }
            }}
          >
            <button
              className="mini-check"
              onClick={(event) => {
                event.stopPropagation();
                props.toggleGoal(goal);
              }}
            >
              {goal.completedAtUtc ? <Check size={14} /> : null}
            </button>
            <div>
              <strong>{goal.title}</strong>
              {goal.topicName && <small>Linked topic: {goal.topicName}</small>}
            </div>
            <button
              className="icon-button subtle"
              onClick={(event) => {
                event.stopPropagation();
                props.deleteGoal(goal);
              }}
              title="Delete goal"
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProgressCard({ progress }: { progress: ProgressSummary }) {
  return (
    <section className="progress-card" aria-label="Overall progress">
      <div className="progress-card-header">
        <span>Overall Progress</span>
        <strong>{progress.percentage}%</strong>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </div>
      <p>
        {progress.done} / {progress.total} done
      </p>
      <small>{progress.remaining} remaining</small>
    </section>
  );
}

function MistakeNotePanel({
  noteDraft,
  setNoteDraft,
  savedNote,
  onSave
}: {
  noteDraft: string;
  setNoteDraft: (value: string) => void;
  savedNote: string;
  onSave: () => void;
}) {
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");

  return (
    <section className="study-section wide note-panel">
      <div className="note-panel-header">
        <h3>Mistake Note</h3>
        <div className="note-tab-row">
          <button
            className={mode === "edit" ? "note-tab active" : "note-tab"}
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          <button
            className={mode === "preview" ? "note-tab active" : "note-tab"}
            onClick={() => setMode("preview")}
            disabled={!noteDraft.trim()}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <>
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Optional: what did you specifically do wrong? Supports markdown and LaTeX (e.g. $O(n \log n)$)."
          />
          <button className="secondary-button" onClick={onSave}>
            <Save size={16} /> Save note
          </button>
        </>
      ) : (
        <div className="note-preview">
          {noteDraft.trim() ? (
            <Md text={noteDraft} />
          ) : (
            <p className="empty-state">Nothing to preview yet.</p>
          )}
        </div>
      )}

      {mode === "edit" && savedNote && savedNote !== noteDraft && (
        <p className="note-saved-hint">Unsaved changes — click Save note to persist.</p>
      )}
    </section>
  );
}

function RevisionPreview({ revisions }: { revisions: RevisionItem[] }) {
  if (!revisions.length) return null;
  return (
    <section className="study-section wide revision-preview">
      <h3>UTC Revision Timeline</h3>
      <div className="revision-chips">
        {revisions.map((revision) => (
          <span key={revision.id} className={revision.completedAtUtc ? "complete" : ""}>
            R{revision.stage}: {formatDate(revision.dueDateUtc)}
          </span>
        ))}
      </div>
    </section>
  );
}

function StudyBundleView({ study }: { study: StudyResponse }) {
  const bundle = study.bundle;
  return (
    <div className="study-grid">
      <section className="study-section wide">
        <h3>Problem</h3>
        <Md text={bundle.problem} />
        <div className="availability-row">
          <span className={study.resources.sources.articleAvailable ? "ok" : "missing"}>
            Notes {study.resources.sources.articleAvailable ? "available" : "missing"}
          </span>
          <span className={study.resources.sources.transcriptAvailable ? "ok" : "missing"}>
            Video transcript {study.resources.sources.transcriptAvailable ? "available" : "missing"}
          </span>
        </div>
      </section>

      <section className="study-section wide">
        <h3>Intuition</h3>
        <Md text={bundle.intuition} />
      </section>

      <section className="study-section wide">
        <h3>Solution</h3>
        <ol>
          {bundle.solution.map((step, index) => (
            <li key={index}><Md text={step} /></li>
          ))}
        </ol>
      </section>

      <section className="study-section wide">
        <h3>
          <Code2 size={18} />
          Python Solution
        </h3>
        <pre>{bundle.pythonCode}</pre>
      </section>

      <section className="study-section">
        <h3>Complexity</h3>
        <Md text={bundle.complexity} />
      </section>

      <section className="study-section">
        <h3>Common Mistakes</h3>
        <ul>
          {bundle.mistakes.map((mistake, index) => (
            <li key={index}><Md text={mistake} /></li>
          ))}
        </ul>
      </section>

      <section className="study-section wide">
        <h3>
          <CheckCircle2 size={18} />
          Source Notes
        </h3>
        <ul>
          {bundle.sourceNotes.map((note, index) => (
            <li key={index}><Md text={note} /></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StudySkeleton() {
  return (
    <div className="study-grid">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="study-section skeleton" key={index} />
      ))}
    </div>
  );
}

function InlineLoading({ label }: { label: string }) {
  return (
    <span className="inline-loading">
      <Loader2 className="spin" size={16} />
      {label}
    </span>
  );
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

function renderLatex(text: string): string {
  const placeholders: string[] = [];

  // Replace $$...$$ display math with placeholders
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex: string) => {
    try {
      const html = katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
      const idx = placeholders.push(html) - 1;
      return `%%KATEX_${idx}%%`;
    } catch {
      return _match;
    }
  });

  // Replace $...$ inline math with placeholders (avoid matching $$)
  processed = processed.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_match, tex: string) => {
    try {
      const html = katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
      const idx = placeholders.push(html) - 1;
      return `%%KATEX_${idx}%%`;
    } catch {
      return _match;
    }
  });

  // Run marked on the placeholder-safe text
  let html = marked.parse(processed, { async: false }) as string;

  // Restore KaTeX rendered HTML from placeholders
  placeholders.forEach((rendered, idx) => {
    html = html.replace(`%%KATEX_${idx}%%`, rendered);
  });

  return html;
}

function Md({ text }: { text: string }) {
  const html = React.useMemo(() => renderLatex(text), [text]);
  return <div className="md-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

function tierLabel(tier: TopicTier) {
  return tiers.find((item) => item.value === tier)?.label || tier;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
