# タイ駐在員事務所 管理システム

## 起動手順（全4ステップ）

---

### STEP 1：Supabaseでデータベースを作る（15分）

1. **https://supabase.com** を開く
2. 「Start your project」→「Sign up」→ Googleアカウントで登録
3. 「New project」をクリック
   - Name：`thai-office`
   - Region：**Southeast Asia (Singapore)**
   - Database Password：任意（メモ不要）
   - 「Create new project」→ 2分待つ
4. 左メニュー「**SQL Editor**」→「**New query**」をクリック
5. このZIPに入っている **`supabase/migrations/001_initial.sql`** を全文コピーして貼り付け → 「**Run**」
6. 左メニュー「**Authentication**」→「**Users**」→「**Add user**」
   - 営業担当と総務担当の2名分のメールアドレスとパスワードを登録
7. SQL Editorで「New query」→ 以下を**IDとメールを書き換えて**実行：
   ```sql
   INSERT INTO public.users (id, name, role, email) VALUES
     ('←AuthのユーザーID1→', '山田太郎', 'sales', 'sales@example.com'),
     ('←AuthのユーザーID2→', '鈴木花子', 'admin', 'admin@example.com');
   ```
   ※ ユーザーIDは Authentication > Users の画面で確認できます
8. 左メニュー「**Settings**」→「**API**」で以下をコピーしてメモ帳に保存
   - **Project URL**（例：`https://abcdef.supabase.co`）
   - **anon public**（`eyJhbGci...` から始まる長い文字列）

---

### STEP 2：netlify.toml を書き換える（2分）

このZIPの中の **`netlify.toml`** をテキストエディタで開き、
**2箇所だけ**書き換えてください：

```toml
NEXT_PUBLIC_SUPABASE_URL = "← STEP 1 でコピーしたProject URLを貼る →"
NEXT_PUBLIC_SUPABASE_ANON_KEY = "← STEP 1 でコピーしたanon keyを貼る →"
```

**Windowsの場合：** ファイルを右クリック →「メモ帳で開く」
**Macの場合：** ファイルを右クリック →「テキストエディットで開く」

書き換えたら保存してください。

---

### STEP 3：GitHubにアップロードする（5分）

1. **https://github.com** を開く → アカウント登録（Googleで可）
2. 右上「**+**」→「**New repository**」
   - Repository name：`thai-office`
   - **Private** を選択
   - 「Create repository」
3. 「**uploading an existing file**」をクリック
4. ZIPを展開したフォルダの中身を**全部ドラッグ＆ドロップ**
5. 「**Commit changes**」をクリック

---

### STEP 4：Netlifyに接続する（5分）

1. **https://netlify.com** を開く → アカウント登録（Googleで可）
2. 「**Add new site**」→「**Import an existing project**」
3. 「**GitHub**」を選択 → `thai-office` リポジトリを選択
4. Build settings はそのままで「**Deploy site**」をクリック
5. 2〜3分待つ → **URLが発行される**（例：`https://thai-office-abc123.netlify.app`）

---

### STEP 5：SupabaseにURLを登録する（2分）

1. Supabase → 「**Authentication**」→「**URL Configuration**」
2. **Site URL** に Netlify のURLを貼る（例：`https://thai-office-abc123.netlify.app`）
3. **Redirect URLs** に `https://thai-office-abc123.netlify.app/**` を追加
4. 「Save」

---

## 完成 🎉

ブラウザで Netlify のURLを開くと、ログイン画面が表示されます。
STEP 1 で登録したメールアドレスとパスワードでログインできます。

**スマホからも同じURLでアクセスできます。アプリのインストールは不要です。**

---

## 月額費用

| サービス | 料金 |
|---|---|
| Supabase | 無料 |
| Netlify | 無料 |
| AIレポート（任意） | $2〜5/月 |
| **合計** | **ほぼ無料** |

---

## AIレポート機能を使いたい場合

1. https://console.anthropic.com でAPIキーを取得
2. `netlify.toml` の以下の行の先頭 `#` を削除してキーを貼る：
   ```toml
   ANTHROPIC_API_KEY = "sk-ant-ここにキーを貼る"
   ```
3. GitHubに再アップロード → Netlifyが自動で再デプロイ

