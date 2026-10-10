import "server-only";
import { localTestMode } from "@/lib/portal/config";
import { buildQueries, vocabulary } from "./queries";
import type { LiteratureSource, Retrieval, SearchRun } from "./types";
const API = "https://www.ebi.ac.uk/europepmc/webservices/rest";
export function plainText(s: string) {
  return s
    .replace(/<(script|style|table-wrap|ref-list)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Math.min(Number(n), 0x10ffff)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function base() {
  if (localTestMode() && process.env.CARDIOAHEAD_TEST_LITERATURE_URL) {
    const u = new URL(process.env.CARDIOAHEAD_TEST_LITERATURE_URL);
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1")
      throw new Error("INVALID_LITERATURE_ENDPOINT");
    return u.href.replace(/\/$/, "");
  }
  return API;
}
async function fetchText(
  url: string,
  deadline: AbortSignal,
  maxBytes = 1500000,
) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([deadline, AbortSignal.timeout(8000)]),
    headers: { Accept: "application/json, application/xml" },
  });
  if (!response.ok) throw new Error("HTTP_" + response.status);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("EMPTY_RESPONSE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("SOURCE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
type Entry = {
  id?: string;
  source?: string;
  title?: string;
  authorList?: { author?: { fullName?: string }[] };
  firstPublicationDate?: string;
  pubYear?: string;
  journalInfo?: { journal?: { title?: string } };
  doi?: string;
  abstractText?: string;
  pmcid?: string;
  isOpenAccess?: string;
  pubTypeList?: { pubType?: string[] };
};
function entrySource(e: Entry, topics: string[]): LiteratureSource | null {
  if (e.source !== "MED" || !/^\d{1,12}$/.test(e.id || "") || !e.title)
    return null;
  const types = (e.pubTypeList?.pubType || []).join(" "),
    title = plainText(e.title);
  if (
    /Retracted Publication|Retraction of Publication|Expression of Concern|Comment|Editorial/i.test(
      types,
    )
  )
    return null;
  const date =
    e.firstPublicationDate || e.pubYear || "";
  if (date && date.slice(0, 10) > new Date().toISOString().slice(0, 10))
    return null;
  const originalGuideline =
    /^(?:\d{4}\s+)?(?:ESC(?:\/EACTS|\/ERS)? Guidelines|AHA\/ACC(?:\/[A-Z]+)* Guideline|ACC\/AHA.*Guideline)|^\d{4} Focused Update of the \d{4} ESC Guidelines/i.test(
      title,
    );
  const evidence_type = /preprint/i.test(types)
    ? "preprint"
    : /Case Reports/i.test(types) || /case (?:report|series)/i.test(title)
      ? "case_report_or_series"
      : originalGuideline || /Guideline/i.test(types)
        ? "guideline"
        : /Systematic Review|Meta-Analysis/i.test(types)
          ? "systematic_review"
          : /protocol|rationale and design/i.test(title)
            ? "study_protocol"
            : /Randomized Controlled Trial/i.test(types)
              ? "randomized_trial"
              : /Clinical Trial/i.test(types)
                ? "clinical_trial"
                : "other_peer_reviewed_or_indexed";
  const text = plainText(e.abstractText || "");
  const matched = topics.filter((id) =>
    vocabulary.find((v) => v.id === id)?.pattern.test(title + " " + text),
  );
  const org = /European Society of Cardiology|\bESC\b/i.test(title + " " + text)
    ? "ESC"
    : /American Heart Association|American College of Cardiology|\bAHA\b|\bACC\b/i.test(
          title,
        )
      ? "ACC/AHA"
      : "";
  return {
    id: "PMID:" + e.id,
    title,
    authors: (e.authorList?.author || [])
      .slice(0, 12)
      .map((a) => a.fullName || "")
      .filter(Boolean),
    date,
    journal: e.journalInfo?.journal?.title || "",
    organisation: org,
    url: "https://pubmed.ncbi.nlm.nih.gov/" + e.id + "/",
    doi_url:
      e.doi && /^10\.\d{4,9}\/[A-Za-z0-9_.;()/:+-]+$/.test(e.doi)
        ? "https://doi.org/" + e.doi
        : "",
    evidence_type,
    access: text ? "abstract_only" : "metadata_only",
    text: text.slice(0, 10000),
    retrieved_at: new Date().toISOString(),
    topics: matched,
    relevance:
      matched.length * 20 +
      topics.filter((id) =>
        vocabulary.find((v) => v.id === id)?.pattern.test(title),
      ).length *
        50 +
      (originalGuideline ? 100 : 0) +
      (evidence_type === "guideline"
        ? 12
        : evidence_type === "systematic_review"
          ? 8
          : 0) +
      (date ? Number(date.slice(0, 4)) - 2000 : 0) / 10,
  };
}
export async function retrieveLiterature(topics: string[]): Promise<Retrieval> {
  const sources = new Map<string, { source: LiteratureSource; entry: Entry }>(),
    searches: SearchRun[] = [],
    limitations: string[] = [];
  const queries = buildQueries(topics),
    deadline = AbortSignal.timeout(45000);
  for (const query of queries) {
    const run: SearchRun = {
      query,
      database: "Europe PMC / PubMed-indexed literature",
      retrieved_at: new Date().toISOString(),
      count: 0,
      failure: "",
    };
    try {
      const url =
        base() +
        "/search?" +
        new URLSearchParams({
          query,
          resultType: "core",
          format: "json",
          pageSize: searches.length < 2 ? "30" : "10",
          sort: "FIRST_PDATE_D desc",
        });
      const result = JSON.parse(await fetchText(url, deadline));
      if (!result.resultList || !Array.isArray(result.resultList.result))
        throw new Error("INVALID_SEARCH_RESPONSE");
      run.count = Number(result.hitCount) || 0;
      for (const entry of result.resultList.result) {
        const source = entrySource(entry, topics);
        if (
          source &&
          source.topics.length &&
          (searches.length >= 2 || source.evidence_type === "guideline")
        )
          sources.set(source.id, { source, entry });
      }
    } catch (e) {
      run.failure =
        e instanceof Error &&
        /^HTTP_\d+$|SOURCE_TOO_LARGE|INVALID_SEARCH_RESPONSE|EMPTY_RESPONSE$/.test(
          e.message,
        )
          ? e.message
          : "SEARCH_FAILED";
    }
    searches.push(run);
  }
  // Retain representation from guidelines, higher-level studies and clearly labelled cases.
  const ranked = [...sources.values()].sort(
    (a, b) => b.source.relevance - a.source.relevance,
  );
  const selected: typeof ranked = [];
  const guides = ranked.filter((v) => v.source.evidence_type === "guideline");
  for (const organisation of ["ESC", "ACC/AHA"])
    selected.push(
      ...guides
        .filter((v) => v.source.organisation === organisation)
        .slice(0, 2),
    );
  for (const guide of guides)
    if (
      selected.length < 4 &&
      !selected.some((v) => v.source.id === guide.source.id)
    )
      selected.push(guide);
  for (const type of [
    "systematic_review",
    "randomized_trial",
    "clinical_trial",
    "case_report_or_series",
  ])
    selected.push(
      ...ranked.filter((v) => v.source.evidence_type === type).slice(0, 2),
    );
  for (const item of ranked)
    if (
      selected.length < 12 &&
      !selected.some((v) => v.source.id === item.source.id)
    )
      selected.push(item);
  const final = selected.slice(0, 12);
  for (const item of final) {
    if (
      item.entry.isOpenAccess !== "Y" ||
      !/^PMC\d+$/.test(item.entry.pmcid || "")
    )
      continue;
    try {
      const xml = await fetchText(
        base() + "/" + item.entry.pmcid + "/fullTextXML",
        deadline,
      );
      const linkedPmid = xml.match(
        /<article-id[^>]*pub-id-type="pmid"[^>]*>([^<]+)<[/]article-id>/,
      )?.[1];
      if (linkedPmid && linkedPmid.trim() !== item.entry.id)
        throw new Error("SOURCE_ID_MISMATCH");
      const body = xml.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/)?.[1];
      if (!body) throw new Error("FULL_TEXT_UNAVAILABLE");
      const paragraphs = [...body.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)]
        .map((m) => plainText(m[1]))
        .filter((s) => s.length > 80);
      const relevant = paragraphs.filter((p) =>
        topics.some((id) =>
          vocabulary.find((v) => v.id === id)?.pattern.test(p),
        ),
      );
      const excerpts = (relevant.length ? relevant : paragraphs)
        .slice(0, 35)
        .join("\n\n")
        .slice(0, 12000);
      if (excerpts.length > 300) {
        item.source.text = excerpts;
        item.source.access = "full_text_excerpts";
      }
    } catch {
      limitations.push("FULL_TEXT_UNAVAILABLE:" + item.source.id);
    }
  }
  const latestGuide = final
    .map((v) => v.source)
    .filter((s) => s.evidence_type === "guideline")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latestGuide?.access === "metadata_only")
    limitations.push("LATEST_GUIDELINE_TEXT_UNAVAILABLE:" + latestGuide.id);
  if (searches.some((s) => s.failure)) limitations.push("SEARCH_INCOMPLETE");
  if (!final.some((v) => v.source.access !== "metadata_only"))
    limitations.push("NO_RELEVANT_READABLE_EVIDENCE");
  if (!final.some((v) => v.source.evidence_type === "guideline"))
    limitations.push("NO_GUIDELINE_RETRIEVED");
  if (!queries.length) limitations.push("NO_SAFE_SEARCH_TERMS");
  return { sources: final.map((v) => v.source), searches, limitations, topics };
}
