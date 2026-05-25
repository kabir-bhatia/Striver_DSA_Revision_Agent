import React from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CheckCircle2,
  Code2,
  ExternalLink,
  Loader2,
  MessageSquare,
  PlayCircle,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2
} from "lucide-react";
import "./styles.css";

type ProgressState = "todo" | "learning" | "revised";

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
  difficulty?: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  progress: ProgressState;
}

interface StudyBundle {
  summary: string;
  intuition: string;
  notes: string[];
  videoSummary: string;
  cppCode: string;
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
  revised: number;
  learning: number;
  todo: number;
  percentage: number;
}

function App() {
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
    revised: 0,
    learning: 0,
    todo: 0,
    percentage: 0
  });
  const [query, setQuery] = React.useState("");
  const [loadingSections, setLoadingSections] = React.useState(true);
  const [loadingTopics, setLoadingTopics] = React.useState(false);
  const [loadingStudy, setLoadingStudy] = React.useState(false);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    loadSections();
  }, []);

  React.useEffect(() => {
    loadTopics();
  }, [selectedSection, selectedSubcategory, query]);

  React.useEffect(() => {
    if (selectedTopic) loadSavedChat(selectedTopic.id);
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
  }

  async function loadProgress() {
    const data = await api<ProgressSummary>("/api/progress");
    setProgress(data);
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

  async function updateProgress(topic: Topic, progress: ProgressState) {
    const updated = await api<Topic>(`/api/topics/${topic.id}/progress`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ progress })
    });
    setTopics((items) =>
      items.map((item) => (item.id === updated.id ? { ...item, progress } : item))
    );
    setSelectedTopic((current) =>
      current?.id === updated.id ? { ...current, progress } : current
    );
    await loadProgress();
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
        <div className="pane-header">
          <div>
            <p className="eyebrow">Sections</p>
            <h2>{selectedSectionData?.name || "Loading"}</h2>
          </div>
          <span className="count-pill">{topics.length} topics</span>
        </div>

        <div className="subcat-row">
          <button
            className={!selectedSubcategory ? "active" : ""}
            onClick={() => setSelectedSubcategory("")}
          >
            All
          </button>
          {selectedSectionData?.subcategories.map((subcategory) => (
            <button
              key={subcategory.id}
              className={selectedSubcategory === subcategory.id ? "active" : ""}
              onClick={() => setSelectedSubcategory(subcategory.id)}
            >
              {subcategory.name}
            </button>
          ))}
        </div>

        <div className="topic-list">
          {loadingTopics && <InlineLoading label="Loading topics" />}
          {!loadingTopics && topics.length === 0 && (
            <p className="empty-state">No topics match this filter.</p>
          )}
          {topics.map((topic) => (
            <button
              key={topic.id}
              className={`topic-row ${selectedTopic?.id === topic.id ? "active" : ""}`}
              onClick={() => {
                setSelectedTopic(topic);
                setStudy(undefined);
              }}
            >
              <span className={`status-dot ${topic.progress}`} />
              <span>
                <strong>{topic.name}</strong>
                <small>{topic.subcategoryName}</small>
              </span>
              <em>{topic.difficulty || "Any"}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="detail-pane">
        {error && <div className="error-banner">{error}</div>}

        {selectedTopic ? (
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
              </div>
            </div>

            <div className="control-row">
              <select
                value={selectedTopic.progress}
                onChange={(event) =>
                  updateProgress(selectedTopic, event.target.value as ProgressState)
                }
              >
                <option value="todo">Todo</option>
                <option value="learning">Learning</option>
                <option value="revised">Revised</option>
              </select>
              <button className="primary-button" onClick={() => loadStudy()}>
                {loadingStudy ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                Generate study bundle
              </button>
              <button className="icon-button" onClick={() => loadStudy(selectedTopic, true)} title="Regenerate">
                <RefreshCcw size={17} />
              </button>
            </div>

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
                    {message.content}
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
        {progress.revised} / {progress.total} completed
      </p>
      <small>
        {progress.learning} learning | {progress.todo} todo
      </small>
    </section>
  );
}

function StudyBundleView({ study }: { study: StudyResponse }) {
  const bundle = study.bundle;
  return (
    <div className="study-grid">
      <section className="study-section wide">
        <h3>Summary</h3>
        <p>{bundle.summary}</p>
        <div className="availability-row">
          <span className={study.resources.sources.articleAvailable ? "ok" : "missing"}>
            Notes {study.resources.sources.articleAvailable ? "available" : "missing"}
          </span>
          <span className={study.resources.sources.transcriptAvailable ? "ok" : "missing"}>
            Video transcript {study.resources.sources.transcriptAvailable ? "available" : "missing"}
          </span>
        </div>
      </section>

      <section className="study-section">
        <h3>Intuition</h3>
        <p>{bundle.intuition}</p>
      </section>

      <section className="study-section">
        <h3>Complexity</h3>
        <p>{bundle.complexity}</p>
      </section>

      <section className="study-section wide">
        <h3>Notes</h3>
        <ul>
          {bundle.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      </section>

      <section className="study-section wide">
        <h3>
          <Code2 size={18} />
          C++ Solution
        </h3>
        <pre>{bundle.cppCode}</pre>
      </section>

      <section className="study-section">
        <h3>Video Summary</h3>
        <p>{bundle.videoSummary || "No transcript summary was available."}</p>
      </section>

      <section className="study-section">
        <h3>Common Mistakes</h3>
        <ul>
          {bundle.mistakes.map((mistake, index) => (
            <li key={index}>{mistake}</li>
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
            <li key={index}>{note}</li>
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
