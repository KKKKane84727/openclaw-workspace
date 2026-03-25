import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;
type LarkModule = typeof import("@larksuiteoapi/node-sdk");

type Args = {
  runDir: string;
  accountId?: string;
  configPath: string;
  openclawConfigPath: string;
  dryRun: boolean;
  targetIds: string[];
};

type FeishuAccount = {
  appId: string;
  appSecret: string;
  domain?: string;
};

type ErrorWithResponse = {
  message?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
};

type TopicCard = {
  id?: string;
  title?: string;
  summary?: string;
  event_time?: string;
  source_urls?: string[];
  angles?: string[];
  controversial_points?: string[];
  topic_score?: number;
};

type PublicationArtifacts = {
  status: "success" | "dry_run" | "error";
  doc?: JsonObject;
  bitable?: JsonObject;
  links?: {
    docUrl?: string;
    bitableUrl?: string;
  };
  error?: string;
};

type FieldDefinition = {
  id?: string;
  name: string;
  type: number;
  property?: unknown;
};

type FieldSchema = {
  name: string;
  type: number;
  property?: JsonObject;
};

type FactSection = {
  index: number;
  theme: string;
  coreFact: string;
  source: string;
  eventTime: string;
  risk: string;
  angle: string;
};

type TweetSection = {
  index: number;
  title: string;
  body: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "workspace-scout",
  "skills",
  "hotspot-workflow",
  "config.json",
);
const DEFAULT_OPENCLAW_CONFIG_PATH = path.resolve(__dirname, "..", "..", "..", "openclaw.json");
const Lark = resolveLarkModule();
const REQUIRED_BITABLE_FIELDS: FieldSchema[] = [
  { name: "X热点追踪", type: 1 },
  { name: "topic_id", type: 1 },
  { name: "title", type: 1 },
  {
    name: "first_seen",
    type: 5,
    property: {
      auto_fill: false,
      date_formatter: "yyyy/MM/dd",
    },
  },
  {
    name: "last_seen",
    type: 5,
    property: {
      auto_fill: false,
      date_formatter: "yyyy/MM/dd",
    },
  },
  { name: "pulse_count", type: 2, property: { formatter: "0.0" } },
  { name: "hotness", type: 2, property: { formatter: "0.0" } },
  { name: "hotness_delta", type: 2, property: { formatter: "0.0" } },
  {
    name: "trend",
    type: 3,
    property: {
      options: [
        { color: 0, name: "上升" },
        { color: 1, name: "平稳" },
        { color: 2, name: "下降" },
        { color: 3, name: "新" },
      ],
    },
  },
  { name: "summary", type: 1 },
  { name: "source", type: 1 },
  { name: "report_link", type: 15 },
  {
    name: "sentiment",
    type: 3,
    property: {
      options: [
        { color: 0, name: "愤怒" },
        { color: 1, name: "焦虑" },
        { color: 2, name: "兴奋" },
        { color: 3, name: "悲伤" },
        { color: 4, name: "中性" },
        { color: 5, name: "激动" },
        { color: 6, name: "好奇" },
        { color: 7, name: "关注" },
      ],
    },
  },
  { name: "topic_angles", type: 1 },
  { name: "priority_score", type: 2, property: { formatter: "0.0" } },
];

function resolveLarkModule(): LarkModule {
  const candidates = [
    path.resolve(process.cwd(), "package.json"),
    path.resolve(process.cwd(), "openclaw", "package.json"),
    path.resolve(__dirname, "..", "..", "..", "..", "coding", "openclaw", "package.json"),
    path.resolve(__dirname, "..", "..", "..", "..", "..", "openclaw", "package.json"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      return createRequire(candidate)("@larksuiteoapi/node-sdk") as LarkModule;
    } catch {
      continue;
    }
  }

  return createRequire(import.meta.url)("@larksuiteoapi/node-sdk") as LarkModule;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    runDir: "",
    configPath: DEFAULT_CONFIG_PATH,
    openclawConfigPath: DEFAULT_OPENCLAW_CONFIG_PATH,
    dryRun: false,
    targetIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run-dir") {
      args.runDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--account-id") {
      args.accountId = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--config-path") {
      args.configPath = argv[index + 1] ?? DEFAULT_CONFIG_PATH;
      index += 1;
      continue;
    }
    if (arg === "--openclaw-config") {
      args.openclawConfigPath = argv[index + 1] ?? DEFAULT_OPENCLAW_CONFIG_PATH;
      index += 1;
      continue;
    }
    if (arg === "--target") {
      const value = argv[index + 1] ?? "";
      if (value.trim()) {
        args.targetIds.push(value.trim());
      }
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  if (!args.runDir) {
    throw new Error("--run-dir is required");
  }

  return args;
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function resolveDomain(domain?: string): string | Lark.Domain {
  if (domain === "lark") {
    return Lark.Domain.Lark;
  }
  if (!domain || domain === "feishu") {
    return Lark.Domain.Feishu;
  }
  return domain.replace(/\/+$/, "");
}

function createClient(account: FeishuAccount): Lark.Client {
  return new Lark.Client({
    appId: account.appId,
    appSecret: account.appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(account.domain),
  });
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function asJsonObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonObject;
}

function getErrorResponse(error: unknown): ErrorWithResponse["response"] {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  return (error as ErrorWithResponse).response;
}

function getErrorHttpStatus(error: unknown): number | undefined {
  const status = getErrorResponse(error)?.status;
  return typeof status === "number" ? status : undefined;
}

function getErrorResponseData(error: unknown): JsonObject | undefined {
  return asJsonObject(getErrorResponse(error)?.data);
}

function diagnoseBitableError(error: unknown): JsonObject | undefined {
  const httpStatus = getErrorHttpStatus(error);
  const responseData = getErrorResponseData(error);
  const errorCode = typeof responseData?.code === "number" ? responseData.code : undefined;

  if (httpStatus === 403 && errorCode === 91403) {
    return {
      category: "base_permission_denied",
      hint: "当前多维表格允许该应用读取，但没有向该应用开放记录写入权限。请把应用或 bot 加入该 Base 的可编辑协作者/角色，或切换到由该应用新建的 Base。",
      suggestedActions: [
        "在目标 Base 里把应用或 bot 加为可编辑协作者",
        "若使用自定义角色，确认该角色包含记录创建和更新权限",
        "无法调整现有 Base 时，改用由该应用新建的 Base",
      ],
    };
  }

  if (httpStatus === 403) {
    return {
      category: "permission_denied",
      hint: "Feishu 拒绝了当前多维表格操作，请检查该 Base 是否向应用开放了对应角色和写权限。",
    };
  }

  return undefined;
}

function utcNowIso(): string {
  return new Date().toISOString();
}

function sortBlocksByFirstLevel(blocks: any[], firstLevelIds: string[]): any[] {
  if (!firstLevelIds.length) {
    return blocks;
  }
  const sorted = firstLevelIds.map((id) => blocks.find((block) => block.block_id === id)).filter(Boolean);
  const sortedIds = new Set(firstLevelIds);
  const remaining = blocks.filter((block) => !sortedIds.has(block.block_id));
  return [...sorted, ...remaining];
}

function splitMarkdownByHeadings(markdown: string): string[] {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
    }
    if (!inFence && /^#{1,2}\s/.test(line) && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  return chunks;
}

function splitMarkdownBySize(markdown: string, maxChars: number): string[] {
  if (markdown.length <= maxChars) {
    return [markdown];
  }

  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let inFence = false;

  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
    }

    const nextLength = currentLength + line.length + 1;
    if (current.length > 0 && nextLength > maxChars && !inFence) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }

    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  if (chunks.length > 1) {
    return chunks;
  }

  const midpoint = Math.floor(lines.length / 2);
  if (midpoint <= 0 || midpoint >= lines.length) {
    return [markdown];
  }
  return [lines.slice(0, midpoint).join("\n"), lines.slice(midpoint).join("\n")];
}

async function convertMarkdown(client: Lark.Client, markdown: string): Promise<{
  blocks: any[];
  firstLevelBlockIds: string[];
}> {
  const response = await client.docx.document.convert({
    data: {
      content_type: "markdown",
      content: markdown,
    },
  });
  if (response.code !== 0) {
    throw new Error(response.msg || "doc convert failed");
  }
  return {
    blocks: response.data?.blocks ?? [],
    firstLevelBlockIds: response.data?.first_level_block_ids ?? [],
  };
}

async function convertMarkdownWithFallback(
  client: Lark.Client,
  markdown: string,
  depth = 0,
): Promise<{ blocks: any[]; firstLevelBlockIds: string[] }> {
  try {
    return await convertMarkdown(client, markdown);
  } catch (error) {
    if (depth >= 8 || markdown.length < 2) {
      throw error;
    }
    const chunks = splitMarkdownBySize(markdown, Math.max(256, Math.floor(markdown.length / 2)));
    if (chunks.length <= 1) {
      throw error;
    }

    const blocks: any[] = [];
    const firstLevelBlockIds: string[] = [];
    for (const chunk of chunks) {
      const converted = await convertMarkdownWithFallback(client, chunk, depth + 1);
      blocks.push(...converted.blocks);
      firstLevelBlockIds.push(...converted.firstLevelBlockIds);
    }
    return { blocks, firstLevelBlockIds };
  }
}

async function chunkedConvertMarkdown(
  client: Lark.Client,
  markdown: string,
): Promise<{ blocks: any[]; firstLevelBlockIds: string[] }> {
  const allBlocks: any[] = [];
  const allFirstLevelBlockIds: string[] = [];
  for (const chunk of splitMarkdownByHeadings(markdown)) {
    const converted = await convertMarkdownWithFallback(client, chunk);
    const sorted = sortBlocksByFirstLevel(converted.blocks, converted.firstLevelBlockIds);
    allBlocks.push(...sorted);
    allFirstLevelBlockIds.push(...converted.firstLevelBlockIds);
  }
  return {
    blocks: allBlocks,
    firstLevelBlockIds: allFirstLevelBlockIds,
  };
}

function cleanBlocksForDescendant(blocks: any[]): any[] {
  return blocks.map((block) => {
    const { parent_id: _parentId, ...cleanBlock } = block;
    if (cleanBlock.block_type === 32 && typeof cleanBlock.children === "string") {
      cleanBlock.children = [cleanBlock.children];
    }
    if (cleanBlock.block_type === 31 && cleanBlock.table?.property) {
      const { row_size: rowSize, column_size: columnSize, column_width: columnWidth } =
        cleanBlock.table.property;
      cleanBlock.table = {
        property: {
          row_size: rowSize,
          column_size: columnSize,
          ...(Array.isArray(columnWidth) && columnWidth.length ? { column_width: columnWidth } : {}),
        },
      };
    }
    return cleanBlock;
  });
}

async function clearDocumentContent(client: Lark.Client, docToken: string): Promise<number> {
  const existing = await client.docx.documentBlock.list({
    path: { document_id: docToken },
  });
  if (existing.code !== 0) {
    throw new Error(existing.msg || "doc list failed");
  }

  const childIds =
    existing.data?.items
      ?.filter((item) => item.parent_id === docToken && item.block_type !== 1)
      .map((item) => item.block_id) ?? [];

  if (!childIds.length) {
    return 0;
  }

  const deleted = await client.docx.documentBlockChildren.batchDelete({
    path: { document_id: docToken, block_id: docToken },
    data: { start_index: 0, end_index: childIds.length },
  });
  if (deleted.code !== 0) {
    throw new Error(deleted.msg || "doc clear failed");
  }
  return childIds.length;
}

async function insertBlocksWithDescendant(
  client: Lark.Client,
  docToken: string,
  blocks: any[],
  firstLevelBlockIds: string[],
): Promise<number> {
  const descendants = cleanBlocksForDescendant(blocks);
  if (!descendants.length) {
    return 0;
  }

  const inserted = await client.docx.documentBlockDescendant.create({
    path: { document_id: docToken, block_id: docToken },
    data: {
      children_id: firstLevelBlockIds,
      descendants,
      index: -1,
    },
  });
  if (inserted.code !== 0) {
    throw new Error(inserted.msg || "doc insert failed");
  }
  return descendants.length;
}

async function createDocument(
  client: Lark.Client,
  title: string,
  folderToken?: string,
): Promise<{ docToken: string; url: string; title: string }> {
  const created = await client.docx.document.create({
    data: {
      title,
      ...(folderToken ? { folder_token: folderToken } : {}),
    },
  });
  if (created.code !== 0) {
    throw new Error(created.msg || "doc create failed");
  }
  const docToken = created.data?.document?.document_id;
  if (!docToken) {
    throw new Error("doc create returned no document_id");
  }
  return {
    docToken,
    url: `https://feishu.cn/docx/${docToken}`,
    title: created.data?.document?.title || title,
  };
}

async function listChatMembers(client: Lark.Client, chatId: string): Promise<string[]> {
  let pageToken: string | undefined;
  const memberIds = new Set<string>();

  do {
    const response = await client.im.chatMembers.get({
      path: { chat_id: chatId },
      params: {
        page_size: 100,
        ...(pageToken ? { page_token: pageToken } : {}),
        member_id_type: "open_id",
      },
    });
    if (response.code !== 0) {
      throw new Error(response.msg || `chat member lookup failed for ${chatId}`);
    }

    for (const item of response.data?.items ?? []) {
      const memberId = normalizeText(item.member_id);
      if (memberId) {
        memberIds.add(memberId);
      }
    }

    pageToken = normalizeText(response.data?.page_token);
  } while (pageToken);

  return Array.from(memberIds);
}

async function shareDocument(
  client: Lark.Client,
  docToken: string,
  targetIds: string[],
): Promise<JsonObject[]> {
  const results: JsonObject[] = [];
  const grantedOpenIds = new Set<string>();

  for (const targetId of targetIds) {
    try {
      const memberIds = await listChatMembers(client, targetId);
      for (const memberId of memberIds) {
        if (grantedOpenIds.has(memberId)) {
          continue;
        }
        grantedOpenIds.add(memberId);
        try {
          const response = await client.drive.permissionMember.create({
            path: { token: docToken },
            params: { type: "docx", need_notification: false },
            data: {
              member_type: "openid",
              member_id: memberId,
              perm: "edit",
            },
          });
          if (response.code !== 0) {
            throw new Error(response.msg || "permission create failed");
          }
          results.push({
            targetId,
            memberId,
            status: "granted",
          });
        } catch (error) {
          results.push({
            targetId,
            memberId,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      results.push({
        targetId,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function parseTimestampMs(value: string | undefined, fallbackMs: number): number {
  const text = normalizeText(value);
  if (!text) {
    return fallbackMs;
  }
  const direct = Date.parse(text);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return Date.parse(`${isoDate[1]}-${isoDate[2]}-${isoDate[3]}T00:00:00Z`);
  }
  const monthDate = text.match(/^(?:[A-Za-z]+)\s+(\d{4})$/);
  if (monthDate) {
    return Date.parse(`${monthDate[1]}-01-01T00:00:00Z`);
  }
  const yearDate = text.match(/^(\d{4})$/);
  if (yearDate) {
    return Date.parse(`${yearDate[1]}-01-01T00:00:00Z`);
  }
  return fallbackMs;
}

function inferSentiment(card: TopicCard): string {
  const combined = `${card.title ?? ""} ${card.summary ?? ""}`.toLowerCase();
  if (/(anger|angry|rage|furious|outrage|愤怒|炮轰)/.test(combined)) {
    return "愤怒";
  }
  if (/(panic|anxiety|fear|risk|焦虑|恐慌)/.test(combined)) {
    return "焦虑";
  }
  if (/(excited|surge|boom|viral|兴奋|爆发)/.test(combined)) {
    return "兴奋";
  }
  if (/(sad|悲伤|mourning|grief)/.test(combined)) {
    return "悲伤";
  }
  if (/(curious|mystery|speculation|好奇|悬念)/.test(combined)) {
    return "好奇";
  }
  if (/(watch|关注|attention|spotlight)/.test(combined)) {
    return "关注";
  }
  return "中性";
}

function containsCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function asciiRatio(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  const asciiCount = Array.from(normalized).filter((char) => /[A-Za-z]/.test(char)).length;
  return asciiCount / normalized.length;
}

function sourceDomains(urls: string[]): string[] {
  const domains: string[] = [];
  for (const raw of urls) {
    try {
      const parsed = new URL(raw);
      const domain = parsed.hostname.replace(/^www\./, "");
      if (domain && !domains.includes(domain)) {
        domains.push(domain);
      }
    } catch {
      continue;
    }
  }
  return domains;
}

function compactText(value: string, maxChars = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const firstSentence = normalized.split(/(?<=[。！？!?])\s+/)[0] || normalized;
  const compact = firstSentence.trim();
  return compact.length > maxChars ? `${compact.slice(0, maxChars).trim()}...` : compact;
}

function extractDomainsFromText(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s）)]+/g) ?? [];
  return sourceDomains(matches);
}

function docTopicTitle(card: TopicCard | undefined, fallbackTitle: string, index: number): string {
  const title = normalizeText(card?.title) || normalizeText(fallbackTitle);
  const summary = normalizeText(card?.summary);
  if (asciiRatio(title) > 0.35 && containsCjk(summary)) {
    return compactText(summary, 24) || `推文 ${index}`;
  }
  return title || `推文 ${index}`;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\n+/g, " ").trim() || "—";
}

function renderTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(" | ")} |`;
  const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.map((item) => escapeTableCell(item)).join(" | ")} |`);
  return [headerRow, dividerRow, ...bodyRows].join("\n");
}

function parseFactSections(markdown: string): Map<number, FactSection> {
  const sections = new Map<number, FactSection>();
  const tweetHeaderIndex = markdown.search(/^##\s*推文\s+\d+/m);
  const factRegion = tweetHeaderIndex >= 0 ? markdown.slice(0, tweetHeaderIndex) : markdown;
  const headerMatches = Array.from(factRegion.matchAll(/^###\s*推文\s+(\d+)\s*$/gm));

  for (let index = 0; index < headerMatches.length; index += 1) {
    const match = headerMatches[index];
    const sectionIndex = Number(match[1]);
    const start = match.index! + match[0].length;
    const end = index + 1 < headerMatches.length ? headerMatches[index + 1].index! : factRegion.length;
    const block = factRegion.slice(start, end);
    const fields: Record<string, string> = {};
    for (const line of block.split("\n")) {
      const lineMatch = line.match(/^\s*-\s*([^：:]+)[：:]\s*(.+?)\s*$/);
      if (!lineMatch) {
        continue;
      }
      fields[lineMatch[1].trim()] = lineMatch[2].trim();
    }
    sections.set(sectionIndex, {
      index: sectionIndex,
      theme: fields["主题"] || "",
      coreFact: fields["核心事实"] || "",
      source: fields["来源"] || "",
      eventTime: fields["时间"] || "",
      risk: fields["存疑点"] || "",
      angle: fields["可演绎部分"] || "",
    });
  }

  return sections;
}

function parseTweetSections(markdown: string): TweetSection[] {
  const matches = Array.from(markdown.matchAll(/^##\s*推文\s+(\d+)\s*[:：]\s*(.+?)\s*$/gm));
  const sections: TweetSection[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const sectionIndex = Number(match[1]);
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : markdown.length;
    const rawBody = markdown.slice(start, end);
    const body = rawBody.replace(/^\s*---\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
    sections.push({
      index: sectionIndex,
      title: match[2].trim(),
      body,
    });
  }

  return sections;
}

function buildDocumentMarkdown(
  runMeta: JsonObject,
  outputMarkdown: string,
  selectedCards: TopicCard[],
): string {
  const runId = normalizeText(runMeta.runId);
  const createdAt = normalizeText(runMeta.createdAt) || utcNowIso();
  const factSections = parseFactSections(outputMarkdown);
  const tweetSections = parseTweetSections(outputMarkdown);

  const overviewRows = tweetSections.map((tweet) => {
    const card = selectedCards[tweet.index - 1];
    const fact = factSections.get(tweet.index);
    return [
      String(tweet.index),
      tweet.title,
      compactText(fact?.coreFact || card?.summary || tweet.body, 34),
      compactText(fact?.risk || fact?.angle || "见正文", 24),
    ];
  });

  const factRows = tweetSections.map((tweet) => {
    const card = selectedCards[tweet.index - 1];
    const fact = factSections.get(tweet.index);
    const domains = Array.isArray(card?.source_urls) ? sourceDomains(card.source_urls) : [];
    const sourceText =
      domains.join(" / ") || extractDomainsFromText(fact?.source || "").join(" / ") || compactText(fact?.source || "", 18);
    return [
      String(tweet.index),
      compactText(fact?.theme || docTopicTitle(card, tweet.title, tweet.index), 20),
      compactText(fact?.coreFact || card?.summary || "", 42),
      compactText(fact?.risk || "无额外红线", 24),
      sourceText || "见原始检索",
    ];
  });

  const bodySections = tweetSections.flatMap((tweet) => [
    `### 推文 ${tweet.index}｜${tweet.title}`,
    "",
    tweet.body,
    "",
  ]);

  return [
    "# 热点守望交付稿",
    "",
    "## 批次概览",
    `- 批次编号：${runId}`,
    `- 生成时间：${createdAt}`,
    `- 推文数量：${tweetSections.length}`,
    "",
    "## 一眼看懂",
    renderTable(["推文", "标题", "核心判断", "风险边界"], overviewRows),
    "",
    "## 事实核查总表",
    renderTable(["推文", "主题", "已核事实", "不能越线的点", "来源概览"], factRows),
    "",
    "## 成稿正文",
    ...bodySections,
  ].join("\n").trim();
}

async function listAllRecords(
  client: Lark.Client,
  appToken: string,
  tableId: string,
): Promise<any[]> {
  const records: any[] = [];
  let pageToken: string | undefined;

  do {
    const response = await client.bitable.appTableRecord.list({
      path: { app_token: appToken, table_id: tableId },
      params: {
        page_size: 500,
        ...(pageToken ? { page_token: pageToken } : {}),
      },
    });
    if (response.code !== 0) {
      throw new Error(response.msg || "bitable list records failed");
    }
    records.push(...(response.data?.items ?? []));
    pageToken = normalizeText(response.data?.page_token);
  } while (pageToken);

  return records;
}

function normalizeFieldDefinition(field: any): FieldDefinition {
  return {
    id: normalizeText(field?.field_id) || undefined,
    name: normalizeText(field?.field_name),
    type: typeof field?.type === "number" ? field.type : 0,
    property: field?.property,
  };
}

async function listFieldDefinitions(
  client: Lark.Client,
  appToken: string,
  tableId: string,
): Promise<FieldDefinition[]> {
  const response = await client.bitable.appTableField.list({
    path: { app_token: appToken, table_id: tableId },
  });
  if (response.code !== 0) {
    throw new Error(response.msg || "bitable list fields failed");
  }
  return (response.data?.items ?? []).map((field) => normalizeFieldDefinition(field)).filter((field) => field.name);
}

async function ensureBitableSchema(
  client: Lark.Client,
  appToken: string,
  tableId: string,
): Promise<FieldDefinition[]> {
  const definitions = await listFieldDefinitions(client, appToken, tableId);
  const knownNames = new Set(definitions.map((field) => field.name));

  for (const schema of REQUIRED_BITABLE_FIELDS) {
    if (knownNames.has(schema.name)) {
      continue;
    }
    const created = await client.bitable.appTableField.create({
      path: { app_token: appToken, table_id: tableId },
      data: {
        field_name: schema.name,
        type: schema.type,
        ...(schema.property ? { property: schema.property } : {}),
      },
    });
    if (created.code !== 0) {
      throw new Error(created.msg || `bitable create field failed for ${schema.name}`);
    }
    const field = normalizeFieldDefinition(created.data?.field);
    definitions.push(field.name ? field : { name: schema.name, type: schema.type, property: schema.property });
    knownNames.add(schema.name);
  }

  return definitions;
}

function setIfFieldExists(fields: Record<string, unknown>, knownFields: Set<string>, name: string, value: unknown) {
  if (!knownFields.has(name)) {
    return;
  }
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === "string" && !value.trim()) {
    return;
  }
  fields[name] = value;
}

function buildBitableRow(
  card: TopicCard,
  knownFields: Set<string>,
  docUrl: string | undefined,
  runMeta: JsonObject,
): Record<string, unknown> {
  const createdAtMs = parseTimestampMs(normalizeText(runMeta.createdAt), Date.now());
  const eventTimeMs = parseTimestampMs(card.event_time, createdAtMs);
  const sourceUrls = Array.isArray(card.source_urls) ? card.source_urls.filter(Boolean) : [];
  const topicScore = typeof card.topic_score === "number" ? card.topic_score : 0;
  const fields: Record<string, unknown> = {};

  setIfFieldExists(fields, knownFields, "X热点追踪", normalizeText(card.title) || normalizeText(card.id));
  setIfFieldExists(fields, knownFields, "topic_id", normalizeText(card.id));
  setIfFieldExists(fields, knownFields, "title", normalizeText(card.title));
  setIfFieldExists(fields, knownFields, "first_seen", eventTimeMs);
  setIfFieldExists(fields, knownFields, "last_seen", createdAtMs);
  setIfFieldExists(fields, knownFields, "pulse_count", sourceUrls.length);
  setIfFieldExists(fields, knownFields, "hotness", topicScore);
  setIfFieldExists(fields, knownFields, "hotness_delta", 0);
  setIfFieldExists(fields, knownFields, "trend", "新");
  setIfFieldExists(fields, knownFields, "summary", normalizeText(card.summary));
  setIfFieldExists(fields, knownFields, "source", sourceUrls.join("\n"));
  if (docUrl) {
    setIfFieldExists(fields, knownFields, "report_link", {
      text: "查看交付文档",
      link: docUrl,
    });
  }
  setIfFieldExists(fields, knownFields, "sentiment", inferSentiment(card));
  setIfFieldExists(
    fields,
    knownFields,
    "topic_angles",
    Array.isArray(card.angles) ? card.angles.filter(Boolean).join(" | ") : "",
  );
  setIfFieldExists(fields, knownFields, "priority_score", topicScore);

  return fields;
}

async function upsertBitableRecords(
  client: Lark.Client,
  appToken: string,
  tableId: string,
  selectedCards: TopicCard[],
  docUrl: string | undefined,
  runMeta: JsonObject,
): Promise<JsonObject[]> {
  const knownFields = new Set((await ensureBitableSchema(client, appToken, tableId)).map((field) => field.name));
  const existingRecords = await listAllRecords(client, appToken, tableId);
  const topicIndex = new Map<string, any>();

  for (const record of existingRecords) {
    const topicId = normalizeText(record.fields?.topic_id);
    if (topicId) {
      topicIndex.set(topicId, record);
    }
  }

  const results: JsonObject[] = [];
  for (const card of selectedCards) {
    const topicId = normalizeText(card.id);
    const fields = buildBitableRow(card, knownFields, docUrl, runMeta);
    if (!Object.keys(fields).length) {
      results.push({
        topicId,
        status: "skipped",
        reason: "no matching bitable fields",
      });
      continue;
    }

    const existing = topicId ? topicIndex.get(topicId) : undefined;
    if (existing?.record_id) {
      const updated = await client.bitable.appTableRecord.update({
        path: {
          app_token: appToken,
          table_id: tableId,
          record_id: existing.record_id,
        },
        data: { fields },
      });
      if (updated.code !== 0) {
        throw new Error(updated.msg || `bitable update failed for ${topicId}`);
      }
      results.push({
        topicId,
        recordId: existing.record_id,
        status: "updated",
      });
      continue;
    }

    const created = await client.bitable.appTableRecord.create({
      path: {
        app_token: appToken,
        table_id: tableId,
      },
      data: { fields },
    });
    if (created.code !== 0) {
      throw new Error(created.msg || `bitable create failed for ${topicId}`);
    }
    results.push({
      topicId,
      recordId: created.data?.record?.record_id,
      status: "created",
    });
  }

  return results;
}

function buildDocTitle(runId: string, selectedCards: TopicCard[], outputMeta: JsonObject): string {
  const outputTitles = Array.isArray(outputMeta.titles) ? (outputMeta.titles as unknown[]) : [];
  const preferredTitle = normalizeText(outputTitles[0]);
  const firstTitle = (preferredTitle || docTopicTitle(selectedCards[0], "", 1)).slice(0, 60);
  return firstTitle ? `热点守望交付 ${runId}｜${firstTitle}` : `热点守望交付 ${runId}`;
}

function mapSelectedCards(factsPayload: JsonObject, runMeta: JsonObject, outputMeta: JsonObject): TopicCard[] {
  const cards = Array.isArray((factsPayload.facts as JsonObject | undefined)?.cards)
    ? (((factsPayload.facts as JsonObject).cards as unknown[]) as TopicCard[])
    : [];
  const cardsById = new Map(cards.map((card) => [normalizeText(card.id), card]));
  const selectedTopicIds = Array.isArray(outputMeta.selectedTopicIds)
    ? (outputMeta.selectedTopicIds as unknown[]).map((item) => normalizeText(item)).filter(Boolean)
    : [];

  if (selectedTopicIds.length) {
    return selectedTopicIds
      .map((topicId) => cardsById.get(topicId) ?? { id: topicId, title: topicId })
      .filter(Boolean);
  }

  const selectedTopics = Array.isArray((runMeta.facts as JsonObject | undefined)?.selectedTopicIds)
    ? ((runMeta.facts as JsonObject).selectedTopicIds as unknown[]).map((item) => normalizeText(item)).filter(Boolean)
    : [];
  return selectedTopics
    .map((topicId) => cardsById.get(topicId) ?? { id: topicId, title: topicId })
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.runDir);
  const skillConfig = loadJson<JsonObject>(path.resolve(args.configPath));
  const openclawConfig = loadJson<JsonObject>(path.resolve(args.openclawConfigPath));
  const feishuConfig = (skillConfig.feishu ?? {}) as JsonObject;
  const openclawFeishu = ((openclawConfig.channels ?? {}) as JsonObject).feishu as JsonObject | undefined;

  if (!openclawFeishu || typeof openclawFeishu !== "object") {
    throw new Error("OpenClaw Feishu config is missing");
  }

  const defaultAccountId = normalizeText(openclawFeishu.defaultAccount) || "main";
  const accountId = args.accountId || normalizeText(feishuConfig.accountId) || defaultAccountId;
  const accounts = (openclawFeishu.accounts ?? {}) as Record<string, FeishuAccount>;
  const account = accounts[accountId];
  if (!account?.appId || !account?.appSecret) {
    throw new Error(`Feishu account is not configured: ${accountId}`);
  }

  const client = createClient(account);
  const runMeta = loadJson<JsonObject>(path.join(runDir, "run.meta.json"));
  const factsPayload = loadJson<JsonObject>(path.join(runDir, "facts.json"));
  const outputMeta = loadJson<JsonObject>(path.join(runDir, "hotspot-output.meta.json"));
  const outputMarkdown = fs.readFileSync(path.join(runDir, "hotspot-output.md"), "utf8");
  const selectedCards = mapSelectedCards(factsPayload, runMeta, outputMeta);
  const targetIds =
    args.targetIds.length > 0
      ? args.targetIds
      : Array.isArray(feishuConfig.targetChannels)
        ? (feishuConfig.targetChannels as unknown[]).map((item) => normalizeText(item)).filter(Boolean)
        : [];

  const appToken = normalizeText((feishuConfig.bitable as JsonObject | undefined)?.appToken);
  const tableId = normalizeText((feishuConfig.bitable as JsonObject | undefined)?.tableId);
  const summaryDocToken = normalizeText((feishuConfig.doc as JsonObject | undefined)?.summaryDocToken);
  const folderToken = normalizeText((feishuConfig.doc as JsonObject | undefined)?.folderToken);
  const createNewDoc = Boolean((feishuConfig.doc as JsonObject | undefined)?.createNewDoc);
  const bitableEnabled = Boolean((feishuConfig.bitable as JsonObject | undefined)?.enabled);
  const bitableUrl = appToken && tableId ? `https://feishu.cn/base/${appToken}?table=${tableId}` : undefined;
  const runId = normalizeText(runMeta.runId) || path.basename(runDir);
  const docTitle = buildDocTitle(runId, selectedCards, outputMeta);

  if (args.dryRun) {
    const payload: PublicationArtifacts = {
      status: "dry_run",
      doc: {
        title: docTitle,
        reuseExisting: !createNewDoc && Boolean(summaryDocToken),
        targetCount: targetIds.length,
      },
      bitable: {
        enabled: bitableEnabled,
        recordCount: selectedCards.length,
      },
      links: {
        docUrl: summaryDocToken && !createNewDoc ? `https://feishu.cn/docx/${summaryDocToken}` : undefined,
        bitableUrl,
      },
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  let docToken = summaryDocToken;
  let docUrl = summaryDocToken ? `https://feishu.cn/docx/${summaryDocToken}` : undefined;
  let docDetails: JsonObject | undefined;
  let docStatus: "success" | "error" = "success";

  try {
    if (createNewDoc || !docToken) {
      const created = await createDocument(client, docTitle, folderToken || undefined);
      docToken = created.docToken;
      docUrl = created.url;
      docDetails = {
        status: "success",
        title: created.title,
        docToken,
        url: docUrl,
      };
    } else {
      docDetails = {
        status: "success",
        title: docTitle,
        docToken,
        url: docUrl,
        reused: true,
      };
    }

    if (!docToken || !docUrl) {
      throw new Error("doc token could not be resolved");
    }

    const shared = await shareDocument(client, docToken, targetIds);
    const docMarkdown = buildDocumentMarkdown(runMeta, outputMarkdown, selectedCards);
    const deletedBlocks = await clearDocumentContent(client, docToken);
    const converted = await chunkedConvertMarkdown(client, docMarkdown);
    const insertedBlocks = await insertBlocksWithDescendant(
      client,
      docToken,
      converted.blocks,
      converted.firstLevelBlockIds,
    );
    docDetails = {
      ...docDetails,
      status: "success",
      shared,
      blocksDeleted: deletedBlocks,
      blocksInserted: insertedBlocks,
    };
  } catch (error) {
    docStatus = "error";
    docDetails = {
      status: "error",
      title: docTitle,
      error: error instanceof Error ? error.message : String(error),
      ...(docToken ? { docToken } : {}),
      ...(docUrl ? { url: docUrl } : {}),
    };
  }

  let bitableDetails: JsonObject = {
    status: "skipped",
    enabled: bitableEnabled,
    appToken,
    tableId,
  };
  if (bitableEnabled && appToken && tableId) {
    try {
      const bitableResults = await upsertBitableRecords(
        client,
        appToken,
        tableId,
        selectedCards,
        docStatus == "success" ? docUrl : undefined,
        runMeta,
      );
      bitableDetails = {
        status: "success",
        enabled: true,
        appToken,
        tableId,
        results: bitableResults,
      };
    } catch (error) {
      const responseData = getErrorResponseData(error);
      const httpStatus = getErrorHttpStatus(error);
      const errorCode = typeof responseData?.code === "number" ? responseData.code : undefined;
      const errorMessage = typeof responseData?.msg === "string" ? responseData.msg : undefined;
      const troubleshooter =
        typeof responseData?.troubleshooter === "string" ? responseData.troubleshooter : undefined;
      const diagnosis = diagnoseBitableError(error);
      bitableDetails = {
        status: "error",
        enabled: true,
        appToken,
        tableId,
        error: error instanceof Error ? error.message : String(error),
        ...(typeof httpStatus === "number" ? { httpStatus } : {}),
        ...(typeof errorCode === "number" ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        ...(troubleshooter ? { troubleshooter } : {}),
        ...(diagnosis ? { diagnosis } : {}),
      };
    }
  }

  const payload: PublicationArtifacts = {
    status: docStatus === "error" && bitableDetails.status === "error" ? "error" : "success",
    doc: docDetails,
    bitable: bitableDetails,
    links: {
      ...(docStatus === "success" && docUrl ? { docUrl } : {}),
      ...(bitableUrl ? { bitableUrl } : {}),
    },
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  const payload: PublicationArtifacts = {
    status: "error",
    error: error instanceof Error ? error.message : String(error),
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
});
