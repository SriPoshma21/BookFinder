import { useEffect, useMemo, useRef, useState } from "react";
import defaultImg from "./assets/default_img.png";
import "./index.css";

const BASE = "https://openlibrary.org/search.json";

// Build book cover URL or fallback image
function coverUrl(cover_i, size = "M") {
  return cover_i && Number(cover_i) > 0
    ? `https://covers.openlibrary.org/b/id/${cover_i}-${size}.jpg`
    : defaultImg;
}

// Escape spaces/quotes for API queries
function esc(v) {
  const t = (v || "").trim();
  return t.includes(" ") ? `${t.replaceAll('"', '\\"')}` : encodeURIComponent(t);
}

// Build OpenLibrary search URL
function buildUrl(p = {}) {
  const params = new URLSearchParams();
  const parts = [];
  if (p.title) parts.push("title:" + esc(p.title));
  if (p.author) parts.push("author:" + esc(p.author));
  if (p.q) parts.push(p.q);
  if (parts.length) params.set("q", parts.join(" "));
  params.set("page", String(p.page || 1));
  params.set("limit", String(p.limit || 24));
  if (p.sort && p.sort !== "relevance") params.set("sort", p.sort);
  params.set(
    "fields",
    ["key", "title", "author_name", "first_publish_year", "subject", "cover_i", "ia"].join(",")
  );
  return BASE + "?" + params.toString();
}

// Custom hook to search OpenLibrary
function useOpenLibrarySearch(initial = {}) {
  const [params, setParams] = useState({ limit: 24, page: 1, sort: "relevance", ...initial });
  const [status, setStatus] = useState("idle");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const url = useMemo(() => buildUrl(params), [params]);

  useEffect(() => {
    const hasQuery = params.q || params.title || params.author;
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
    }, 300);
    return () => clearTimeout(id);
  }, [url]);

  function update(next) {
    setParams((p) => ({ ...p, ...next, page: next.page ?? 1 }));
  }

  return { params, update, status, data, error };
}

// Search input and type selector
function SearchControls({ filters, setFilters, onSearch }) {
  return (
    <form className="controls" onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
      <div className="row">
        <input
          type="text"
          placeholder={`Search by ${filters.by}`}
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <select
          value={filters.by}
          onChange={(e) => setFilters({ ...filters, by: e.target.value })}
        >
          <option value="title">Title</option>
          <option value="author">Author</option>
          <option value="relevance">Relevance</option>
        </select>
        <button className="primary" type="submit">Search</button>
      </div>
    </form>
  );
}

// Book results grid
function BookGrid({ books }) {
  return (
    <div className="grid">
      {books.map((book) => (
        <div className="card" key={book.key}>
          <img src={coverUrl(book.cover_i)} alt={`Cover of ${book.title}`} />
          <div className="body">
            <div className="title">{book.title}</div>
            <div className="meta">
              {book.author_name?.join(", ")} · {book.first_publish_year}
            </div>
            <div className="tags">
              {book.subject?.slice(0, 3).map((sub) => (
                <span className="tag" key={sub}>{sub}</span>
              ))}
            </div>
            <a
              href={
                book.ia
                  ? `https://archive.org/details/${book.ia[0]}`
                  : `https://openlibrary.org${book.key}`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Read
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}


// Pagination
function Pagination({ page, totalPages, onPage }) {
  return (
    <nav className="pagination">
      <button disabled={page === 1} onClick={() => onPage(page - 1)}>&lt;</button>
      <span>Page {page} of {totalPages}</span>
      <button disabled={page === totalPages} onClick={() => onPage(page + 1)}>&gt;</button>
    </nav>
  );
}

// Main App
export default function App() {
  const { params, update, status, data, error } = useOpenLibrarySearch();
  const [filters, setFilters] = useState({ q: "", by: "title" });

  function applySearch() {
    const p = { limit: 24, page: 1, sort: filters.by === "relevance" ? "relevance" : undefined };
    if (filters.by === "title") p.title = filters.q;
    else if (filters.by === "author") p.author = filters.q;
    else p.q = filters.q;
    update(p);
  }

  return (
    <div className="layout">
      <header>
        <div className="container">
          <span className="logo">📚</span>
          <h1 style={{fontFamily:"Dancing Script, cursive"}}>BookFinder</h1>
        </div>
      </header>
      <main className="container">
        <SearchControls filters={filters} setFilters={setFilters} onSearch={applySearch} />
        <section className="results" aria-live="polite">
          {status === "loading" && <div className="center">Loading…</div>}
          {status === "error" && <div className="center">{error}</div>}
          {status === "empty" && <div className="center">No results.</div>}
          {status === "success" && <BookGrid books={data.docs} />}
        </section>
        {status === "success" && data.numFound > params.limit && (
          <Pagination
            page={params.page}
            totalPages={Math.ceil(data.numFound / params.limit)}
            onPage={(p) => update({ page: p })}
          />
        )}
      </main>
    </div>
  );
}
