import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

const BASE = "https://openlibrary.org/search.json";

function coverUrl(cover_i, size = "M") {
  return cover_i
    ? `https://covers.openlibrary.org/b/id/${cover_i}-${size}.jpg`
    : `https://covers.openlibrary.org/b/id/0-${size}.jpg`;
} // Covers API pattern [10]

function esc(v) {
  const t = (v || "").trim();
  return t.includes(" ") ? `"${t.replaceAll('"', '\\"')}"` : encodeURIComponent(t);
}

function buildUrl(p = {}) {
  const params = new URLSearchParams();
  const parts = [];
  if (p.title) parts.push("title:" + esc(p.title));
  if (p.author) parts.push("author:" + esc(p.author));
  if (p.subject) parts.push("subject:" + esc(p.subject));
  if (p.language) parts.push("language:" + encodeURIComponent(p.language));
  if (p.yearStart || p.yearEnd) {
    const s = p.yearStart || "*";
    const e = p.yearEnd || "*";
    parts.push(`first_publish_year:[${s} TO ${e}]`);
  }
  if (p.q) parts.push(p.q);
  if (parts.length) params.set("q", parts.join(" "));
  params.set("page", String(p.page || 1)); // page starts at 1
  params.set("limit", String(p.limit || 24));
  if (p.sort && p.sort !== "relevance") params.set("sort", p.sort);
  params.set(
    "fields",
    ["key", "title", "author_name", "first_publish_year", "subject", "cover_i", "ia"].join(",")
  );
  return BASE + "?" + params.toString();
} // Search API params and pagination [1]

function useOpenLibrarySearch(initial = {}) {
  const [params, setParams] = useState({ limit: 24, page: 1, sort: "relevance", ...initial });
  const [status, setStatus] = useState("idle"); // idle | loading | success | error | empty
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const url = useMemo(() => buildUrl(params), [params]);

  useEffect(() => {
    const hasQuery = params.q || params.title || params.author || params.subject || params.isbn;
    if (!hasQuery) {
      setStatus("idle");
      setData(null);
      setError(null);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError(null);

    const id = setTimeout(async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const json = await res.json();
        if (!json.docs?.length) {
          setData({ ...json, docs: [] });
          setStatus("empty");
          return;
        }
        setData(json);
        setStatus("success");
      } catch (e) {
        if (e.name === "AbortError") return;
        setError(e.message || "Network error");
        setStatus("error");
      }
    }, 300); // debounce

    return () => clearTimeout(id);
  }, [url]);

  function update(next) {
    setParams((p) => ({ ...p, ...next, page: next.page ?? 1 })); // reset page on param change
  }

  return { params, update, status, data, error };
}

function SearchControls({ onSearch, filters, setFilters }) {
  return (
    <div className="controls">
      <div className="row">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Search by title, author, subject, ISBN"
          aria-label="Search books"
        />
        <button className="primary" onClick={onSearch}>Search</button>
      </div>
      <div className="row">
        <input placeholder="Title" value={filters.title} onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))} />
        <input placeholder="Author" value={filters.author} onChange={(e) => setFilters((f) => ({ ...f, author: e.target.value }))} />
        <input placeholder="Subject" value={filters.subject} onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))} />
        <select value={filters.language} onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))} aria-label="Language">
          <option value="">Any language</option>
          <option value="en">English</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
          <option value="de">German</option>
        </select>
        <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))} aria-label="Sort">
          <option value="relevance">Relevance</option>
          <option value="new">Newest</option>
          <option value="old">Oldest</option>
          <option value="random">Random</option>
          <option value="key">Key</option>
        </select>
        <input type="number" min="0" placeholder="Year from" value={filters.yearStart} onChange={(e) => setFilters((f) => ({ ...f, yearStart: e.target.value }))} />
        <input type="number" min="0" placeholder="Year to" value={filters.yearEnd} onChange={(e) => setFilters((f) => ({ ...f, yearEnd: e.target.value }))} />
      </div>
    </div>
  );
}

function Results({ status, data, page, setPage }) {
  if (status === "idle") return <div className="center">Start typing and press Search.</div>; // initial state [1]
  if (status === "loading") return <div className="center">Loading…</div>; // fetch state [6]
  if (status === "error") return <div className="center">Something went wrong. Please try again.</div>; // error state [6]
  if (status === "empty") return <div className="center">No results found.</div>; // no results [1]

  const total = data?.numFound || 0;
  const docs = data?.docs || [];
  const LIMIT = 24;
  const cap = Math.min(total, 1000);

  return (
    <>
      <div className="grid">
        {docs.map((doc) => {
          const title = doc.title || "Untitled";
          const authors = (doc.author_name || []).join(", ") || "Unknown";
          const year = doc.first_publish_year ? " · " + doc.first_publish_year : "";
          const cover = coverUrl(doc.cover_i, "M");
          const link = "https://openlibrary.org" + doc.key;
          const tags = (doc.subject || []).slice(0, 5);
          return (
            <article key={doc.key} className="card" tabIndex={0} role="article" aria-label={title} onClick={() => window.open(link, "_blank")}>
              <img src={cover} alt={`${title} cover`} loading="lazy" />
              <div className="body">
                <div className="title">{title}</div>
                <div className="meta">{authors}{year}</div>
                <div className="tags">
                  {tags.map((t) => <span className="tag" key={t}>{t}</span>)}
                </div>
                <a href={link} onClick={(e)=>e.stopPropagation()} target="_blank" rel="noopener noreferrer">Open Library</a>
              </div>
            </article>
          );
        })}
      </div>
      <div className="pagination">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
        <div className="center" style={{ padding: "8px 12px" }}>
          Page {page} · {Math.min((page - 1) * LIMIT + docs.length, total)} of {total}
        </div>
        <button onClick={() => setPage((p) => p + 1)} disabled={page * LIMIT >= cap}>Next</button>
      </div>
    </>
  );
}

export default function App() {
  const [filters, setFilters] = useState({
    q: "",
    title: "",
    author: "",
    subject: "",
    language: "",
    yearStart: "",
    yearEnd: "",
    sort: "relevance"
  });
  const { params, update, status, data } = useOpenLibrarySearch({ limit: 24, sort: "relevance" });

  const onSearch = () => {
    update({
      q: filters.q.trim(),
      title: filters.title.trim(),
      author: filters.author.trim(),
      subject: filters.subject.trim(),
      language: filters.language || undefined,
      yearStart: filters.yearStart ? Number(filters.yearStart) : undefined,
      yearEnd: filters.yearEnd ? Number(filters.yearEnd) : undefined,
      sort: filters.sort
    });
  };

  return (
    <div className="layout">
      <header>
        <div className="container">
          <h1>Book Finder</h1>
          <SearchControls onSearch={onSearch} filters={filters} setFilters={setFilters} />
        </div>
      </header>
      <main className="container results">
        <Results status={status} data={data} page={params.page || 1} setPage={(p) => {
          const next = typeof p === "function" ? p(params.page || 1) : p;
          update({ page: next });
        }} />
      </main>
      <footer>
        <div className="container"><small>Data: Open Library APIs</small></div>
      </footer>
    </div>
  );
}
