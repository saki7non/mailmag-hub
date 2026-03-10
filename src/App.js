import { useState, useEffect, useCallback } from "react";

// ── ストレージキー ─────────────────────────────────────────
const KEY_ARTICLES = "mailmag:articles";
const KEY_MEMOS    = "mailmag:memos";
const KEY_WEEKMEMO = "mailmag:weekmemo";
const KEY_XPROMPTS = "mailmag:xprompts";

// ── ストレージ操作 ─────────────────────────────────────────
async function storageGet(key) {
  try { return await window.storage.get(key); } catch { return null; }
}
async function storageSet(key, value) {
  try { return await window.storage.set(key, JSON.stringify(value)); } catch { return null; }
}

// ── タイトルの数字・記号を除去 ────────────────────────────
function cleanTitle(t) {
  return t
    .replace(/^[\d]+[\.,\-\s。、]+/, "")
    .replace(/^Vol\.?\d+[\s\u3000]*/i, "")
    .replace(/^No\.?\d+[\s\u3000]*/i, "")
    .replace(/^【?\d+号】?[\s\u3000]*/, "")
    .trim();
}

// ── デフォルトXプロンプト ──────────────────────────────────
const DEFAULT_XPROMPTS = [
  { label:"共感・悩み型",   emoji:"💭", template:"「{{冒頭40文字}}…」\n\nこれ、ずっと悩んでた方いませんか？\n\n実は私も同じ状況でした。\nある方法を試したら毎月3万円変わったんです✨\n\n詳しくはメルマガで📩\n#家計管理 #節約 #主婦の知恵" },
  { label:"ノウハウ型",     emoji:"💡", template:"✅ 知ってた？\n\n{{冒頭40文字}}…\n\nこれだけで毎月の出費がガラッと変わります。\n難しくないし今日からできる👌\n\n📩 詳しくはメルマガへ\n#節約術 #お金の知識" },
  { label:"ストーリー型",   emoji:"📖", template:"📖 実話です。\n\n数年前の私は貯金0円でした。\n{{冒頭30文字}}…がきっかけで少しずつ変わりました🌸\n\n#貯金 #家計 #30代主婦" },
  { label:"ハッとさせる型", emoji:"✨", template:"え、これ知らないと損かも。\n\n「{{冒頭25文字}}…」\n\nほとんどの人がやっていない、でも効果絶大💡\n\nメルマガで詳しく👇\n#お金 #節約 #ライフハック" },
  { label:"日常・親近感型", emoji:"🌸", template:"今朝の我が家の話。\n\n{{冒頭35文字}}…\n\n小さな積み重ねが気づいたら大きな差に😌\n\n#主婦の日常 #家計管理 #暮らし" },
];

function applyTemplate(template, text) {
  return template
    .replace("{{冒頭40文字}}", text.slice(0,40))
    .replace("{{冒頭35文字}}", text.slice(0,35))
    .replace("{{冒頭30文字}}", text.slice(0,30))
    .replace("{{冒頭25文字}}", text.slice(0,25));
}

// ── Transform helpers ──────────────────────────────────────
function xTransform(text, style, prompts) {
  const tmpl = (prompts && prompts[style]?.template) || DEFAULT_XPROMPTS[style]?.template || "";
  return applyTemplate(tmpl, text);
}
function noteTransform(text) {
  return text
    .replace(/ーーー[\s　ーー]*※[\s\S]*$/m, "")   // ーーー ※〜以降のフッターを全削除
    .replace(/＜メルマガ運営者情報＞[\s\S]*$/m, "") // 運営者情報以降を削除
    .replace(/https?:\/\/\S+/g, "")                // URLを削除
    .replace(/%\w+%/g, "")                          // %cancelurl%などのタグを削除
    .replace(/【.*?登録.*?】[\s\S]*?$/m, "")        // 【登録】系を削除
    .replace(/■.*?メルマガ.*?\n/g, "")              // ■メルマガ系を削除
    .replace(/▼.*?登録.*?\n/g, "")                  // ▼登録系を削除
    .replace(/\n{3,}/g, "\n\n")                     // 連続する空行を整理
    .trim();
}
function scriptGen(text) {
  return `【YouTube台本】約10分想定\n\n━━━━━━━━━━━━━━━\n🎬 オープニング（0:00〜1:00）\n━━━━━━━━━━━━━━━\n「こんにちは！[お名前]です。\n今日は『${text.slice(0,24)}』についてお話しします。\n\n30〜40代の主婦の方がお金の不安をなくして\nゆとりある暮らしを実現するヒントをお届けしています。」\n\n━━━━━━━━━━━━━━━\n📌 本編①：問題提起（1:00〜3:00）\n━━━━━━━━━━━━━━━\n「こんな悩みありませんか？\n・毎月お金が残らない\n・貯金しようとしても続かない\n・何から始めればいいかわからない」\n\n━━━━━━━━━━━━━━━\n💡 本編②：解決策（3:00〜7:00）\n━━━━━━━━━━━━━━━\n「${text.slice(0,200)}\n\nポイントをまとめると…\n① まず〇〇を見直す\n② 次に〇〇を習慣化する\n③ 最後に〇〇を仕組み化する」\n\n━━━━━━━━━━━━━━━\n✅ まとめ（7:00〜9:30）\n━━━━━━━━━━━━━━━\n「この3つを意識するだけで家計が変わります！\nぜひ今日からやってみてください。」\n\n━━━━━━━━━━━━━━━\n📣 エンディング（9:30〜10:00）\n━━━━━━━━━━━━━━━\n「最後まで見てくれてありがとうございます。\nチャンネル登録と高評価をぜひお願いします！またね👋」`;
}

// ── 初期データ ─────────────────────────────────────────────
const DEFAULT_ARTICLES = [
  { id:1, date:"2025-03-10", title:"家計管理で月3万円節約できた話",    genre:"節約術",    src:"manual",   status:["X済","note済"] },
  { id:2, date:"2025-03-09", title:"ポイント活用で食費が激減した方法", genre:"マネー管理", src:"obsidian", status:["X予約済"] },
  { id:3, date:"2025-03-08", title:"貯金ゼロから100万円を貯めるまで", genre:"貯金",       src:"obsidian", status:[] },
  { id:4, date:"2025-03-07", title:"電気代を半分にした5つの習慣",     genre:"節約術",    src:"manual",   status:["X済","note済","台本済"] },
];
const DEFAULT_MEMOS = [
  { id:1, title:"note投稿のコツ",   body:"タイトルは感情ワードを入れると読まれやすい。「節約」より「月3万浮いた」の方がクリックされる。", pinned:true,  date:"2025-03-08" },
  { id:2, title:"Xのベストタイム", body:"朝7〜8時と夜21〜22時が一番エンゲージメント高い。主婦層は夜の方が反応が良い傾向。",               pinned:false, date:"2025-03-05" },
];

// ── Constants ─────────────────────────────────────────────
const TABS = [
  { id:"dashboard", label:"Dashboard",   icon:"▦", ja:"ダッシュボード" },
  { id:"obsidian",  label:"Obsidian",    icon:"◈", ja:"記事取込" },
  { id:"mailmag",   label:"Mailmag",     icon:"✉", ja:"メルマガ管理" },
  { id:"note",      label:"Note",        icon:"◎", ja:"note転載" },
  { id:"x",         label:"X Post",      icon:"𝕏", ja:"X投稿変換" },
  { id:"youtube",   label:"YouTube",     icon:"▷", ja:"台本生成" },
  { id:"memo",      label:"Memo",        icon:"◆", ja:"運営メモ" },
];
const ROUTINE = [
  { id:1, label:"メルマガ執筆・送信" },
  { id:2, label:"noteに転載" },
  { id:3, label:"X投稿を作成・予約" },
  { id:4, label:"Obsidianに保存" },
  { id:5, label:"YouTube台本チェック" },
];
const GENRES   = ["マネー管理","節約術","貯金","投資入門","家計簿","ライフスタイル","未分類"];
const XPROMPTS = [
  { label:"共感・悩み型",   emoji:"💭" },
  { label:"ノウハウ型",     emoji:"💡" },
  { label:"ストーリー型",   emoji:"📖" },
  { label:"ハッとさせる型", emoji:"✨" },
  { label:"日常・親近感型", emoji:"🌸" },
];
const SBADGE = {
  "X済":     { bg:"#fce4f0", c:"#c0306a", br:"#f0b0d0" },
  "X予約済": { bg:"#e4eeff", c:"#2a50b8", br:"#aac0f8" },
  "note済":  { bg:"#fce4ea", c:"#c03048", br:"#f0a8b8" },
  "台本済":  { bg:"#fef3e4", c:"#b86020", br:"#f0d0a0" },
};

// ── Main App ───────────────────────────────────────────────
export default function App() {
  const [tab, setTab]               = useState("dashboard");
  const [checked, setChecked]       = useState({});
  const [articles, setArticles]     = useState([]);
  const [memos, setMemos]           = useState([]);
  const [weekMemo, setWeekMemo]     = useState("");
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState(""); // "saving" | "saved" | ""

  const [mailText, setMailText]     = useState("");
  const [mailTitle, setMailTitle]   = useState("");
  const [xPrompt, setXPrompt]       = useState(0);
  const [xOut, setXOut]             = useState("");
  const [xPrompts, setXPrompts]     = useState(DEFAULT_XPROMPTS);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [noteTitle, setNoteTitle]   = useState("");
  const [noteGenre, setNoteGenre]   = useState(GENRES[0]);
  const [noteText, setNoteText]     = useState("");
  const [prettyLink, setPrettyLink] = useState("");
  const [ytScript, setYtScript]     = useState("");
  const [memoTitle, setMemoTitle]   = useState("");
  const [memoBody, setMemoBody]     = useState("");
  const [obsFiles, setObsFiles]     = useState([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [obsSelected, setObsSelected] = useState(null);
  const [copied, setCopied]         = useState("");

  // ── 起動時にストレージから読込 ──────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [a, m, w, xp] = await Promise.all([
        storageGet(KEY_ARTICLES),
        storageGet(KEY_MEMOS),
        storageGet(KEY_WEEKMEMO),
        storageGet(KEY_XPROMPTS),
      ]);
      setArticles(a  ? JSON.parse(a.value)  : DEFAULT_ARTICLES);
      setMemos(m     ? JSON.parse(m.value)  : DEFAULT_MEMOS);
      setWeekMemo(w  ? JSON.parse(w.value)  : "");
      setXPrompts(xp ? JSON.parse(xp.value) : DEFAULT_XPROMPTS);
      setLoading(false);
    })();
  }, []);

  // ── 保存ヘルパー ────────────────────────────────────────
  const showSaved = useCallback(() => {
    setSaveStatus("saving");
    setTimeout(() => setSaveStatus("saved"), 400);
    setTimeout(() => setSaveStatus(""), 2000);
  }, []);

  async function persistArticles(next) {
    setArticles(next);
    await storageSet(KEY_ARTICLES, next);
    showSaved();
  }
  async function persistMemos(next) {
    setMemos(next);
    await storageSet(KEY_MEMOS, next);
    showSaved();
  }
  async function persistWeekMemo(val) {
    setWeekMemo(val);
    await storageSet(KEY_WEEKMEMO, val);
  }

  // ── 操作関数 ────────────────────────────────────────────
  function cp(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1800);
  }

  async function loadObsidian() {
    if (!window.showDirectoryPicker) { alert("Chrome / Edge でご利用ください。"); return; }
    try {
      setObsLoading(true);
      const dir = await window.showDirectoryPicker();
      const files = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "file" && name.endsWith(".md")) {
          const file = await handle.getFile();
          const text = await file.text();
          files.push({ id:name, name:name.replace(".md",""), text, date:new Date(file.lastModified).toISOString().slice(0,10), size:text.length });
        }
      }
      files.sort((a,b) => b.date.localeCompare(a.date));
      setObsFiles(files);
    } catch(e) { if (e.name !== "AbortError") alert("エラー: " + e.message); }
    finally { setObsLoading(false); }
  }

  function importFile(f) {
    setMailText(f.text);
    setMailTitle(f.name);
    const next = articles.find(a => a.title === f.name) ? articles : [
      { id:Date.now(), date:f.date, title:f.name.slice(0,28)+(f.name.length>28?"…":""), genre:"未分類", src:"obsidian", status:[] },
      ...articles,
    ];
    persistArticles(next);
    setTab("mailmag");
  }

  async function saveArticle() {
    if (!mailText.trim()) return;
    const title = mailTitle || mailText.slice(0,20)+"…";
    const next = [{ id:Date.now(), date:new Date().toISOString().slice(0,10), title, genre:"未分類", src:"manual", status:[] }, ...articles];
    await persistArticles(next);
    setMailText(""); setMailTitle("");
  }

  async function updateStatus(articleId, status) {
    const next = articles.map(a => a.id === articleId ? { ...a, status } : a);
    await persistArticles(next);
  }

  async function addMemo() {
    if (!memoTitle.trim()) return;
    const next = [{ id:Date.now(), title:memoTitle, body:memoBody, pinned:false, date:new Date().toISOString().slice(0,10) }, ...memos];
    await persistMemos(next);
    setMemoTitle(""); setMemoBody("");
  }

  const done = Object.values(checked).filter(Boolean).length;
  const today = new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"});

  const input = { width:"100%", boxSizing:"border-box", padding:"9px 12px", border:"1px solid #e0e0e0", borderRadius:6, fontSize:13, color:"#333", outline:"none", background:"#fff", fontFamily:"inherit" };
  const ta    = { ...input, resize:"vertical", lineHeight:1.8 };

  // ── ローディング ─────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f2f5", flexDirection:"column", gap:14 }}>
        <div style={{ width:36, height:36, background:"linear-gradient(135deg,#f06090,#e8789a)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:18 }}>M</div>
        <div style={{ fontSize:13, color:"#aaa", fontFamily:"sans-serif" }}>データを読み込んでいます…</div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#f0f2f5", fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif", fontSize:13, color:"#333" }}>
      <style>{`
        @keyframes fi { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:none; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        button:hover { opacity:0.88; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:#f0f2f5; }
        ::-webkit-scrollbar-thumb { background:#ddd; border-radius:99px; }
      `}</style>

      {/* ── TOP NAV ── */}
      <header style={{ height:52, background:"#fff", borderBottom:"1px solid #e8e8e8", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", flexShrink:0, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, background:"linear-gradient(135deg,#f06090,#e8789a)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:14 }}>M</div>
          <span style={{ fontWeight:800, fontSize:15, color:"#222", letterSpacing:"0.04em" }}>Mailmag Hub</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {/* 保存ステータス */}
          {saveStatus === "saving" && (
            <span style={{ fontSize:11, color:"#bbb", animation:"pulse 0.6s infinite" }}>💾 保存中…</span>
          )}
          {saveStatus === "saved" && (
            <span style={{ fontSize:11, color:"#70c080", fontWeight:600 }}>✓ 保存しました</span>
          )}
          <span style={{ fontSize:12, color:"#999" }}>{today}</span>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#f0c0cc" }}></div>
            <span style={{ fontSize:12, color:"#aaa" }}>API未連携</span>
          </div>
          <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#f9c0d4,#f06090)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:13 }}>M</div>
        </div>
      </header>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{ width:200, background:"#fff", borderRight:"1px solid #e8e8e8", display:"flex", flexDirection:"column", flexShrink:0 }}>
          <div style={{ padding:"20px 16px 8px", fontSize:10, fontWeight:700, color:"#bbb", letterSpacing:"0.12em", textTransform:"uppercase" }}>Navigation</div>
          {TABS.map(t => {
            const act = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", border:"none", background:act?"#fff5f8":"transparent", color:act?"#e8789a":"#666", fontWeight:act?700:400, fontSize:13, cursor:"pointer", textAlign:"left", fontFamily:"inherit", borderLeft:act?"3px solid #e8789a":"3px solid transparent", transition:"all 0.12s" }}>
                <span style={{ fontSize:15, width:18, textAlign:"center", opacity:act?1:0.55 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:act?700:500 }}>{t.label}</div>
                  <div style={{ fontSize:10, color:act?"#f0a8c0":"#bbb", marginTop:1 }}>{t.ja}</div>
                </div>
              </button>
            );
          })}

          {/* progress */}
          <div style={{ marginTop:"auto", padding:"16px", borderTop:"1px solid #f0f0f0" }}>
            <div style={{ fontSize:10, color:"#bbb", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Today's Progress</div>
            <div style={{ height:4, background:"#f5e8ee", borderRadius:99, overflow:"hidden", marginBottom:6 }}>
              <div style={{ height:"100%", width:`${(done/ROUTINE.length)*100}%`, background:"linear-gradient(90deg,#f06090,#e8789a)", borderRadius:99, transition:"width 0.4s" }}/>
            </div>
            <div style={{ fontSize:11, color:"#e8789a", fontWeight:600 }}>{done} / {ROUTINE.length} 完了</div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex:1, overflowY:"auto", padding:"24px" }}>

          {/* ═══ DASHBOARD ═══ */}
          {tab === "dashboard" && (
            <div style={{ animation:"fi 0.2s ease" }}>
              <PageHead title="Dashboard" sub="ダッシュボード" />

              {/* stat tiles */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
                {[
                  { label:"総メルマガ数", value:articles.length, color:"#e8789a", icon:"✉" },
                  { label:"今月の配信",   value:articles.filter(a => a.date?.startsWith(new Date().toISOString().slice(0,7))).length, color:"#7ab8f5", icon:"📅" },
                  { label:"note転載済",  value:articles.filter(a => a.status?.includes("note済")).length, color:"#70c9a0", icon:"◎" },
                  { label:"X投稿済",     value:articles.filter(a => a.status?.some(s => s.startsWith("X"))).length, color:"#f5a770", icon:"𝕏" },
                ].map((s,i) => (
                  <div key={i} style={{ background:"#fff", borderRadius:8, padding:"18px 20px", border:"1px solid #ececec", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize:10.5, color:"#aaa", marginBottom:8, fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase" }}>{s.label}</div>
                    <div style={{ fontSize:28, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                    <div style={{ fontSize:18, marginTop:10, opacity:0.35 }}>{s.icon}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

                {/* checklist */}
                <Card title="Daily Checklist" sub="デイリーチェック">
                  {ROUTINE.map(r => (
                    <div key={r.id} onClick={() => setChecked(p => ({...p,[r.id]:!p[r.id]}))} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid #f5f5f5", cursor:"pointer" }}>
                      <div style={{ width:18, height:18, borderRadius:4, flexShrink:0, border:checked[r.id]?"none":"1.5px solid #ddd", background:checked[r.id]?"linear-gradient(135deg,#f06090,#e8789a)":"#fff", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
                        {checked[r.id] && <span style={{ color:"#fff", fontSize:10, fontWeight:700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:13, color:checked[r.id]?"#ccc":"#444", textDecoration:checked[r.id]?"line-through":"none", transition:"all 0.15s" }}>{r.label}</span>
                    </div>
                  ))}
                </Card>

                {/* recent articles */}
                <Card title="Recent Articles" sub="最近のメルマガ">
                  {articles.slice(0,5).map(a => (
                    <div key={a.id} style={{ padding:"9px 0", borderBottom:"1px solid #f5f5f5" }}>
                      <div style={{ fontSize:12.5, fontWeight:600, color:"#333", marginBottom:5, lineHeight:1.4 }}>{a.title}</div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center" }}>
                        <span style={{ fontSize:10, color:"#bbb" }}>{a.date}</span>
                        {a.src==="obsidian" && <SBadge bg="#f0e8ff" c="#7040b0" br="#d8c8f4">◈ Obs</SBadge>}
                        {a.status?.length===0 && <span style={{ fontSize:10, color:"#ccc" }}>未着手</span>}
                        {a.status?.map(s => <SBadge key={s} bg={SBADGE[s]?.bg} c={SBADGE[s]?.c} br={SBADGE[s]?.br}>{s}</SBadge>)}
                      </div>
                    </div>
                  ))}
                </Card>

                {/* weekly memo */}
                <div style={{ gridColumn:"1 / -1" }}>
                  <Card title="Weekly Memo" sub="今週の意識ポイント（自動保存）">
                    <textarea
                      value={weekMemo}
                      onChange={e => persistWeekMemo(e.target.value)}
                      placeholder="例：今週は節約シリーズを強化。Xでは共感系ツイートを中心に…"
                      style={{ ...ta, height:68, border:"1px dashed #e8c8d8", background:"#fff9fb" }}
                    />
                    <div style={{ fontSize:11, color:"#ccc", marginTop:6 }}>💾 入力内容は自動で保存されます</div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* ═══ OBSIDIAN ═══ */}
          {tab === "obsidian" && (
            <div style={{ animation:"fi 0.2s ease" }}>
              <PageHead title="Obsidian Import" sub="Vaultから記事を取込" />
              <Card title="Folder Import" sub="フォルダを選択して.mdファイルを読込">
                <p style={{ fontSize:13, color:"#666", lineHeight:1.8, margin:"0 0 16px" }}>
                  「フォルダを選択」ボタンで Obsidian の Vault またはメルマガ保存フォルダを選択すると、
                  <strong style={{ color:"#e8789a" }}> .md ファイル</strong>をすべて読み込みます。<br/>
                  ✅ <strong>完全無料</strong> · ブラウザ標準機能（Chrome / Edge 対応）
                </p>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <PinkBtn onClick={loadObsidian} disabled={obsLoading}>{obsLoading?"読込中…":"◈ フォルダを選択"}</PinkBtn>
                  {obsFiles.length > 0 && <span style={{ fontSize:13, color:"#e8789a", fontWeight:700 }}>{obsFiles.length}件 読み込み済み ✓</span>}
                </div>
                <div style={{ marginTop:12, padding:"10px 14px", background:"#fff9fb", borderRadius:6, border:"1px solid #f5dde8", fontSize:12, color:"#aaa" }}>
                  💡 Safari は未対応です。Chrome または Edge をご利用ください。
                </div>
              </Card>

              {obsFiles.length > 0 && (
                <div style={{ marginTop:16 }}>
                  <Card title="File List" sub={`${obsFiles.length}件のファイル`}>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {obsFiles.map(f => (
                        <div key={f.id} onClick={() => setObsSelected(f)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:6, border:`1px solid ${obsSelected?.id===f.id?"#e8789a":"#ececec"}`, background:obsSelected?.id===f.id?"#fff5f8":"#fff", cursor:"pointer", transition:"all 0.12s" }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#333" }}>{f.name}</div>
                            <div style={{ fontSize:10.5, color:"#bbb", marginTop:2 }}>{f.date} · {f.size.toLocaleString()}文字</div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); importFile(f); }} style={{ padding:"6px 14px", borderRadius:5, border:"1px solid #e8c8d8", background:"#fff", color:"#e8789a", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                            取込 →
                          </button>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {obsSelected && (
                <div style={{ marginTop:16 }}>
                  <Card title="Preview" sub={obsSelected.name}>
                    <div style={{ fontSize:12.5, color:"#666", lineHeight:1.9, whiteSpace:"pre-wrap", maxHeight:200, overflowY:"auto", background:"#f9f9f9", borderRadius:6, padding:"12px 14px", border:"1px solid #ececec" }}>
                      {obsSelected.text.slice(0,400)}{obsSelected.text.length>400?"…":""}
                    </div>
                    <div style={{ marginTop:12 }}>
                      <PinkBtn onClick={() => importFile(obsSelected)}>✉ このファイルを取込む</PinkBtn>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ═══ MAILMAG ═══ */}
          {tab === "mailmag" && (
            <div style={{ animation:"fi 0.2s ease" }}>
              <PageHead title="Mailmag" sub="メルマガ管理" />
              <Card title="New Entry" sub="メルマガを貼り付け・保存">
                <input value={mailTitle} onChange={e => setMailTitle(e.target.value)} placeholder="タイトル（空欄なら本文から自動取得）" style={{ ...input, marginBottom:10 }}/>
                <textarea value={mailText} onChange={e => setMailText(e.target.value)} placeholder="ここにメルマガ本文を貼り付けてください…" style={{ ...ta, height:150 }}/>
                <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                  <PinkBtn onClick={saveArticle}>💾 一覧に保存</PinkBtn>
                  <GhostBtn onClick={() => { setNoteText(noteTransform(mailText)); setTab("note"); }}>◎ noteへ</GhostBtn>
                  <GhostBtn onClick={() => setTab("x")}>𝕏 X投稿へ</GhostBtn>
                  <GhostBtn onClick={() => { setYtScript(scriptGen(mailText)); setTab("youtube"); }}>▷ 台本へ</GhostBtn>
                </div>
                <div style={{ marginTop:14, padding:"10px 14px", background:"#fff9fb", borderRadius:6, border:"1px solid #f5dde8", fontSize:12, color:"#c06080" }}>
                  ✦ <strong>AI自動変換</strong>（Claude API連携）は近日対応予定。現在はテンプレート変換でご利用いただけます。
                </div>
              </Card>

              <div style={{ marginTop:16 }}>
                <Card title="Articles" sub={`メルマガ一覧 ${articles.length}件 · 💾 保存済`}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:10 }}>
                    {articles.map(a => (
                      <div key={a.id} style={{ padding:"12px 14px", borderRadius:6, border:"1px solid #ececec", background:"#fafafa" }}>
                        <div style={{ fontSize:12.5, fontWeight:600, color:"#333", marginBottom:7, lineHeight:1.4 }}>{a.title}</div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
                          <span style={{ fontSize:10, color:"#bbb" }}>{a.date}</span>
                          {a.src==="obsidian" && <SBadge bg="#f0e8ff" c="#7040b0" br="#d8c8f4">◈ Obs</SBadge>}
                          <SBadge bg="#fff0f5" c="#e8789a" br="#f8d0e0">{a.genre}</SBadge>
                        </div>
                        {/* ステータスボタン */}
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {["X済","note済","台本済"].map(s => {
                            const has = a.status?.includes(s);
                            return (
                              <button key={s} onClick={() => {
                                const next = has ? a.status.filter(x=>x!==s) : [...(a.status||[]), s];
                                updateStatus(a.id, next);
                              }} style={{ fontSize:10, padding:"2px 7px", borderRadius:4, border:`1px solid ${has?SBADGE[s]?.br:"#e0e0e0"}`, background:has?SBADGE[s]?.bg:"#fff", color:has?SBADGE[s]?.c:"#bbb", cursor:"pointer", fontFamily:"inherit", fontWeight:has?600:400, transition:"all 0.15s" }}>
                                {has?"✓ ":""}{s}
                              </button>
                            );
                          })}
                          <button onClick={() => {
                            if(window.confirm("この記事を削除しますか？")) {
                              persistArticles(articles.filter(x=>x.id!==a.id));
                            }
                          }} style={{ fontSize:10, padding:"2px 7px", borderRadius:4, border:"1px solid #eee", background:"transparent", color:"#ddd", cursor:"pointer", fontFamily:"inherit", marginLeft:"auto" }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ═══ NOTE ═══ */}
          {tab === "note" && (
            <div style={{ animation:"fi 0.2s ease" }}>
              <PageHead title="Note" sub="note転載・管理" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <Card title="Settings" sub="記事設定">
                  <FLabel>タイトル</FLabel>
                  <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="note用タイトル" style={{ ...input, marginBottom:10 }}/>
                  <FLabel>ジャンル</FLabel>
                  <select value={noteGenre} onChange={e => setNoteGenre(e.target.value)} style={{ ...input, marginBottom:10 }}>
                    {GENRES.map(g => <option key={g}>{g}</option>)}
                  </select>
                  <FLabel>週次リンク（プリティーリンク）</FLabel>
                  <input value={prettyLink} onChange={e => setPrettyLink(e.target.value)} placeholder="https://example.com/mail" style={{ ...input, marginBottom:14 }}/>
                  <PinkBtn onClick={() => { setNoteText(noteTransform(mailText)); if(!noteTitle&&mailTitle) setNoteTitle(cleanTitle(mailTitle)); }}>◈ メルマガから本文を生成</PinkBtn>
                </Card>
                <Card title="Preview" sub="転載プレビュー">
                  {noteTitle && <div style={{ fontSize:15, fontWeight:700, color:"#333", marginBottom:10 }}>{noteTitle}</div>}
                  <div style={{ fontSize:12.5, color:"#666", lineHeight:1.9, minHeight:130, background:"#f9f9f9", borderRadius:6, padding:14, border:"1px dashed #e0e0e0", whiteSpace:"pre-wrap" }}>
                    {noteText || "「本文を生成」を押すとリンク・案内文を自動削除した本文が表示されます"}
                  </div>
                  {prettyLink && noteText && (
                    <div style={{ marginTop:10, padding:"10px 14px", background:"#fff5f8", borderRadius:6, fontSize:12, color:"#e8789a", border:"1px solid #f5dde8" }}>
                      📩 メルマガ登録はこちら → {prettyLink}
                    </div>
                  )}
                  {noteText && (
                    <div style={{ marginTop:12 }}>
                      <PinkBtn onClick={() => cp(`${noteTitle}\n\n${noteText}${prettyLink?`\n\n📩 メルマガ登録 → ${prettyLink}`:""}`, "note")}>
                        {copied==="note"?"✓ コピーしました":"📋 全文コピー"}
                      </PinkBtn>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ═══ X ═══ */}
          {tab === "x" && (
            <div style={{ animation:"fi 0.2s ease" }}>
              <PageHead title="X Post" sub="X投稿変換" />

              {/* スタイル選択 */}
              <Card title="Style Select" sub="投稿スタイルを選択 · クリックで編集">
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom: editingPrompt!==null ? 16 : 0 }}>
                  {xPrompts.map((p,i) => (
                    <div key={i} style={{ display:"flex", gap:4, alignItems:"center" }}>
                      <button onClick={() => { setXPrompt(i); setEditingPrompt(null); }} style={{ padding:"7px 14px", borderRadius:"5px 0 0 5px", border:xPrompt===i?"none":"1px solid #ddd", borderRight:"none", background:xPrompt===i?"linear-gradient(135deg,#f06090,#e8789a)":"#fff", color:xPrompt===i?"#fff":"#666", fontWeight:xPrompt===i?700:400, fontSize:12.5, cursor:"pointer", fontFamily:"inherit", boxShadow:xPrompt===i?"0 2px 8px rgba(232,120,154,0.3)":"none" }}>
                        {p.emoji} {p.label}
                      </button>
                      <button onClick={() => setEditingPrompt(editingPrompt===i ? null : i)} style={{ padding:"7px 8px", borderRadius:"0 5px 5px 0", border:"1px solid #ddd", background:editingPrompt===i?"#fff5f8":"#fff", color:editingPrompt===i?"#e8789a":"#bbb", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>✏️</button>
                    </div>
                  ))}
                </div>

                {/* プロンプト編集パネル */}
                {editingPrompt !== null && (
                  <div style={{ marginTop:12, padding:"14px 16px", background:"#fff9fb", borderRadius:8, border:"1px solid #f5dde8" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#e8789a", marginBottom:8 }}>
                      ✏️ 「{xPrompts[editingPrompt].label}」のテンプレートを編集
                    </div>
                    <div style={{ fontSize:11, color:"#bbb", marginBottom:8 }}>
                      使えるタグ：<code style={{background:"#f0f0f0",padding:"1px 5px",borderRadius:3}}>{"{{冒頭40文字}}"}</code>　<code style={{background:"#f0f0f0",padding:"1px 5px",borderRadius:3}}>{"{{冒頭30文字}}"}</code>　<code style={{background:"#f0f0f0",padding:"1px 5px",borderRadius:3}}>{"{{冒頭25文字}}"}</code>
                    </div>
                    <textarea
                      value={xPrompts[editingPrompt].template}
                      onChange={e => {
                        const next = xPrompts.map((p,i) => i===editingPrompt ? {...p, template:e.target.value} : p);
                        setXPrompts(next);
                        storageSet(KEY_XPROMPTS, next);
                      }}
                      style={{ width:"100%", boxSizing:"border-box", padding:"10px 12px", border:"1px solid #e8c8d8", borderRadius:6, fontSize:12.5, lineHeight:1.8, resize:"vertical", height:140, fontFamily:"inherit", color:"#333", outline:"none" }}
                    />
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <button onClick={() => {
                        const next = xPrompts.map((p,i) => i===editingPrompt ? {...p, template:DEFAULT_XPROMPTS[i].template} : p);
                        setXPrompts(next);
                        storageSet(KEY_XPROMPTS, next);
                      }} style={{ padding:"5px 12px", borderRadius:5, border:"1px solid #ddd", background:"#fff", color:"#aaa", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
                        🔄 デフォルトに戻す
                      </button>
                      <button onClick={() => setEditingPrompt(null)} style={{ padding:"5px 12px", borderRadius:5, border:"none", background:"linear-gradient(135deg,#f06090,#e8789a)", color:"#fff", fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>
                        ✓ 完了
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:16 }}>
                <Card title="Source" sub="元のメルマガ文">
                  <textarea value={mailText} onChange={e => setMailText(e.target.value)} placeholder="メルマガ本文を貼り付けてください" style={{ ...ta, height:200 }}/>
                  <div style={{ marginTop:10 }}>
                    <PinkBtn onClick={() => setXOut(xTransform(mailText, xPrompt, xPrompts))}>✨ X投稿に変換</PinkBtn>
                  </div>
                </Card>
                <Card title="Output" sub="生成されたX投稿">
                  <textarea value={xOut} onChange={e => setXOut(e.target.value)} placeholder="変換ボタンを押すと下書きが表示されます" style={{ ...ta, height:200 }}/>
                  {xOut && (
                    <div style={{ marginTop:10, display:"flex", gap:10, alignItems:"center" }}>
                      <PinkBtn onClick={() => cp(xOut,"x")}>{copied==="x"?"✓ コピーしました":"📋 コピー"}</PinkBtn>
                      <span style={{ fontSize:12, color:xOut.length>140?"#e05050":"#bbb", fontWeight:600 }}>{xOut.length} 文字</span>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ═══ YOUTUBE ═══ */}
          {tab === "youtube" && (
            <div style={{ animation:"fi 0.2s ease" }}>
              <PageHead title="YouTube Script" sub="YouTube台本生成" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <Card title="Source" sub="メルマガ本文">
                  <textarea value={mailText} onChange={e => setMailText(e.target.value)} placeholder="メルマガ本文を貼り付けてください" style={{ ...ta, height:220 }}/>
                  <div style={{ marginTop:10 }}>
                    <PinkBtn onClick={() => setYtScript(scriptGen(mailText))}>▷ 10分台本を生成</PinkBtn>
                  </div>
                </Card>
                <Card title="Script" sub="生成された台本">
                  <textarea value={ytScript} onChange={e => setYtScript(e.target.value)} placeholder="「台本を生成」を押すとオープニング〜エンディングまで表示されます" style={{ ...ta, height:220 }}/>
                  {ytScript && (
                    <div style={{ marginTop:10 }}>
                      <PinkBtn onClick={() => cp(ytScript,"yt")}>{copied==="yt"?"✓ コピーしました":"📋 台本をコピー"}</PinkBtn>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ═══ MEMO ═══ */}
          {tab === "memo" && (
            <div style={{ animation:"fi 0.2s ease" }}>
              <PageHead title="Memo" sub="運営メモ · 💾 保存済" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1.8fr", gap:16 }}>
                <Card title="Add Memo" sub="新しいメモを追加">
                  <input value={memoTitle} onChange={e => setMemoTitle(e.target.value)} placeholder="タイトル" style={{ ...input, marginBottom:10 }}/>
                  <textarea value={memoBody} onChange={e => setMemoBody(e.target.value)} placeholder="メモの内容…" style={{ ...ta, height:130, marginBottom:10 }}/>
                  <PinkBtn onClick={addMemo}>💾 保存する</PinkBtn>
                </Card>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[...memos].sort((a,b) => Number(b.pinned)-Number(a.pinned)).map(m => (
                    <div key={m.id} style={{ background:"#fff", borderRadius:8, padding:"14px 18px", border:"1px solid #ececec", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                          {m.pinned && <SBadge bg="#fff0f5" c="#e8789a" br="#f5d0e0">◆ 固定</SBadge>}
                          <span style={{ fontSize:13.5, fontWeight:700, color:"#333" }}>{m.title}</span>
                        </div>
                        <div style={{ display:"flex", gap:4 }}>
                          <button onClick={() => persistMemos(memos.map(x => x.id===m.id?{...x,pinned:!x.pinned}:x))} style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:12, color:"#ccc", padding:"2px 5px", fontFamily:"inherit" }}>◆</button>
                          <button onClick={() => { if(window.confirm("削除しますか？")) persistMemos(memos.filter(x=>x.id!==m.id)); }} style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:12, color:"#ccc", padding:"2px 5px", fontFamily:"inherit" }}>✕</button>
                        </div>
                      </div>
                      <p style={{ fontSize:12.5, color:"#666", lineHeight:1.75, margin:0 }}>{m.body}</p>
                      <div style={{ fontSize:10.5, color:"#ccc", marginTop:8 }}>{m.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────
function PageHead({ title, sub }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:"#222", margin:0 }}>{title}</h2>
        <span style={{ fontSize:12, color:"#bbb" }}>{sub}</span>
      </div>
      <div style={{ height:2, width:36, background:"linear-gradient(90deg,#f06090,#e8789a)", borderRadius:99, marginTop:6 }}/>
    </div>
  );
}
function Card({ title, sub, children }) {
  return (
    <div style={{ background:"#fff", borderRadius:8, border:"1px solid #ececec", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", overflow:"hidden" }}>
      <div style={{ padding:"11px 18px", borderBottom:"1px solid #f5f5f5", display:"flex", alignItems:"baseline", gap:8 }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#333" }}>{title}</span>
        <span style={{ fontSize:11, color:"#bbb" }}>{sub}</span>
      </div>
      <div style={{ padding:"16px 18px" }}>{children}</div>
    </div>
  );
}
function FLabel({ children }) {
  return <label style={{ fontSize:11, fontWeight:600, color:"#aaa", display:"block", marginBottom:5, letterSpacing:"0.04em", textTransform:"uppercase" }}>{children}</label>;
}
function SBadge({ children, bg, c, br }) {
  return <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:bg, color:c, border:`1px solid ${br}`, fontWeight:600 }}>{children}</span>;
}
function PinkBtn({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding:"9px 18px", borderRadius:6, border:"none", background:disabled?"#f5e0e8":"linear-gradient(135deg,#f06090,#e8789a)", color:"#fff", fontWeight:700, fontSize:13, cursor:disabled?"not-allowed":"pointer", boxShadow:disabled?"none":"0 2px 8px rgba(232,120,154,0.35)", fontFamily:"inherit", opacity:disabled?0.6:1 }}>{children}</button>;
}
function GhostBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ padding:"9px 16px", borderRadius:6, border:"1px solid #e8c8d8", background:"#fff", color:"#e8789a", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>;
}
