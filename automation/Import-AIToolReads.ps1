[CmdletBinding()]
param(
  [string]$SourceFolder = 'D:\nas3-backup\專題講座\職場AI賦能 - 複製\AI工具選讀',
  [string]$ApiUrl = $env:AIHUB_CONTENT_API_URL,
  [string]$IngestSecret = $env:AIHUB_INGEST_SECRET,
  [string]$GeminiApiKey = $env:GEMINI_API_KEY,
  [string]$GeminiModel = 'gemini-3.5-flash-lite',
  [string]$StatePath = (Join-Path $env:LOCALAPPDATA 'AIHubWorks\outlook-import-state.json'),
  [int]$Limit = 0,
  [switch]$DryRun,
  [switch]$SkipAI
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-CleanText {
  param([AllowEmptyString()][string]$Value)

  if (-not $Value) { return '' }
  $decoded = [Net.WebUtility]::HtmlDecode($Value)
  return (($decoded -replace '\r\n?', "`n") -replace '[\u0000-\u0008\u000B\u000C\u000E-\u001F]', '').Trim()
}

function ConvertFrom-SafeLink {
  param([string]$Url)

  try {
    $uri = [Uri]$Url
    if ($uri.Host -notlike '*.safelinks.protection.outlook.com') { return $Url }
    foreach ($part in $uri.Query.TrimStart('?').Split('&')) {
      $pair = $part.Split('=', 2)
      if ($pair.Count -eq 2 -and $pair[0] -eq 'url') {
        return [Uri]::UnescapeDataString($pair[1])
      }
    }
  } catch { }
  return $Url
}

function ConvertTo-CanonicalUrl {
  param([string]$Url)

  $clean = [Net.WebUtility]::HtmlDecode([string]$Url).Trim()
  $clean = ConvertFrom-SafeLink $clean
  try {
    $builder = [UriBuilder]$clean
    if ($builder.Scheme -notin @('http', 'https')) { return '' }
    $builder.Fragment = ''

    $dropKeys = @('fbclid', 'gclid', 'igshid', 'mibextid', 'slof', 'xmt', 'si', 'feature')
    $queryParts = @($builder.Query.TrimStart('?') -split '&' | Where-Object { $_ })
    $kept = foreach ($part in $queryParts) {
      $pair = $part.Split('=', 2)
      $key = [Uri]::UnescapeDataString($pair[0]).ToLowerInvariant()
      if ($key -like 'utm_*' -or $key -in $dropKeys) { continue }
      $part
    }
    $builder.Query = @($kept) -join '&'
    return $builder.Uri.AbsoluteUri.TrimEnd('/')
  } catch {
    return ''
  }
}

function Get-MessageUrls {
  param(
    [string]$HtmlBody,
    [string]$TextBody
  )

  $found = New-Object 'System.Collections.Generic.List[string]'
  $hrefPattern = '(?i)href\s*=\s*["''](?<url>https?://[^"'']+)["'']'
  foreach ($match in [regex]::Matches([string]$HtmlBody, $hrefPattern)) {
    $found.Add($match.Groups['url'].Value)
  }

  $rawPattern = 'https?://[^\s<>"'']+'
  foreach ($match in [regex]::Matches(([string]$HtmlBody + "`n" + [string]$TextBody), $rawPattern)) {
    $found.Add($match.Value.TrimEnd('.', ',', ';', ')', ']', '>'))
  }
  Write-Verbose "郵件網址候選數：$($found.Count)"

  $unique = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($url in $found) {
    $canonical = ConvertTo-CanonicalUrl $url
    if (-not $canonical) {
      Write-Verbose "略過無法正規化的網址：$url"
      continue
    }
    try {
      $urlHost = ([Uri]$canonical).Host.ToLowerInvariant()
      if ($urlHost -match '(^|\.)(microsoftonline|office|office365|schemas\.microsoft)\.com$') { continue }
    } catch { continue }
    [void]$unique.Add($canonical)
  }
  Write-Verbose "正規化後網址數：$($unique.Count)"
  return @($unique)
}

function Get-SourceHints {
  param([string]$Url)

  $platform = ''
  $author = ''
  try {
    $uri = [Uri]$Url
    $sourceHost = $uri.Host.ToLowerInvariant() -replace '^www\.', ''
    switch -Regex ($sourceHost) {
      '(^|\.)threads\.com$' {
        $platform = 'Threads'
        $segment = $uri.AbsolutePath.Trim('/').Split('/')[0]
        if ($segment -like '@*') { $author = $segment }
        break
      }
      '(^|\.)instagram\.com$' { $platform = 'Instagram'; break }
      '(^|\.)facebook\.com$' { $platform = 'Facebook'; break }
      '(^|\.)linkedin\.com$' { $platform = 'LinkedIn'; break }
      '(^|\.)youtube\.com$|^youtu\.be$' { $platform = 'YouTube'; break }
      '^share\.google$' { $platform = 'Google 分享連結'; break }
      default { $platform = $sourceHost }
    }
  } catch { }
  return [pscustomobject]@{ platform = $platform; author = $author }
}

function Get-FallbackSummary {
  param([string]$Subject, [string]$Body)

  $withoutUrls = ([string]$Body -replace 'https?://\S+', '') -replace '\s+', ' '
  $withoutUrls = $withoutUrls.Trim()
  if ($withoutUrls -and $withoutUrls -ne $Subject) {
    return ($withoutUrls.Substring(0, [Math]::Min(300, $withoutUrls.Length)))
  }
  return "這篇內容聚焦於「$Subject」。原文細節與作者資訊仍需在發布前確認。"
}

function Get-HttpErrorDetail {
  param([Management.Automation.ErrorRecord]$ErrorRecord)

  try {
    $response = $ErrorRecord.Exception.Response
    if (-not $response) { return $ErrorRecord.Exception.Message }
    $stream = $response.GetResponseStream()
    $reader = New-Object IO.StreamReader($stream)
    try {
      $content = $reader.ReadToEnd()
      if ($content) { return $content }
    } finally {
      $reader.Dispose()
      $stream.Dispose()
    }
  } catch { }
  return $ErrorRecord.Exception.Message
}

function Invoke-GeminiDraft {
  param(
    [string]$Subject,
    [string]$Body,
    [string]$SourceUrl,
    [pscustomobject]$Hints
  )

  $prompt = @"
你是 AIHub Works 的中文內容編輯。請根據 Outlook 郵件主旨、郵件內文與原文網址，整理一筆「AI 工具選讀」草稿。

規則：
1. 優先查閱原文網址；若網址需要登入或無法讀取，只能依郵件內容判斷，禁止杜撰。
2. 郵件寄件者是收藏者，不是原作者。原作者應從原文頁面或社群帳號判斷。
3. title 使用繁體中文，清楚且不誇大，約 15～50 字。
4. summary 使用繁體中文，約 80～160 字，說明核心觀點與可運用情境。
5. curator_note 是 1～2 句可供站長修改的選讀重點，不得冒充站長親身心得。
6. tool_name 只填文章明確涉及的 AI 工具；無法確認時留空。
7. tags 提供 3～6 個短標籤。
8. 無法確認作者或發布日時留空，並在 review_note 說明。

郵件主旨：$Subject
郵件內文：$Body
原文網址：$SourceUrl
網址推測平台：$($Hints.platform)
網址推測作者：$($Hints.author)
"@

  $schema = @{
    type = 'object'
    properties = @{
      title = @{ type = 'string'; description = '繁體中文內容標題' }
      summary = @{ type = 'string'; description = '80～160 字繁體中文摘要' }
      source_platform = @{ type = 'string'; description = '來源平台，例如 Threads、Instagram 或網站名稱' }
      source_author = @{ type = 'string'; description = '原作者或社群帳號；無法確認時為空字串' }
      tool_name = @{ type = 'string'; description = '文章涉及的 AI 工具；無法確認時為空字串' }
      tags = @{ type = 'array'; items = @{ type = 'string' } }
      curator_note = @{ type = 'string'; description = '供站長修改的選讀重點草稿' }
      source_publish_date = @{ type = 'string'; description = '原文發布日 YYYY-MM-DD；無法確認時為空字串' }
      confidence = @{ type = 'string'; enum = @('high', 'medium', 'low') }
      review_note = @{ type = 'string'; description = '需要人工確認的項目；沒有時為空字串' }
    }
    required = @('title', 'summary', 'source_platform', 'source_author', 'tool_name', 'tags', 'curator_note', 'source_publish_date', 'confidence', 'review_note')
  }

  $request = @{
    contents = @(@{ parts = @(@{ text = $prompt }) })
    generationConfig = @{
      responseMimeType = 'application/json'
      responseSchema = $schema
    }
  }
  if ($GeminiModel -eq 'gemini-3.6-flash') {
    $request.tools = @(@{ urlContext = @{} })
  }

  $endpoint = "https://generativelanguage.googleapis.com/v1beta/models/$GeminiModel`:generateContent"
  $headers = @{ 'x-goog-api-key' = $GeminiApiKey }
  try {
    $response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($request | ConvertTo-Json -Depth 20)
  } catch {
    # 某些需登入的社群網址可能讓 URL Context 失敗；保留郵件內容並重試一次。
    $urlContextError = Get-HttpErrorDetail $_
    [void]$request.Remove('tools')
    try {
      $response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($request | ConvertTo-Json -Depth 20)
    } catch {
      $plainError = Get-HttpErrorDetail $_
      throw "Gemini API 失敗。移除 URL Context 後：$plainError；原始錯誤：$urlContextError"
    }
  }

  $text = @($response.candidates[0].content.parts | ForEach-Object { $_.text }) -join ''
  if (-not $text) { throw 'Gemini 沒有回傳可用內容。' }
  return $text | ConvertFrom-Json
}

function Invoke-ContentIngest {
  param([hashtable]$Item)

  $request = @{
    action = 'ingest_tool_read'
    secret = $IngestSecret
    item = $Item
  }
  $response = Invoke-RestMethod -Method Post -Uri $ApiUrl -ContentType 'application/json; charset=utf-8' -Body ($request | ConvertTo-Json -Depth 12)
  if (-not $response.ok) { throw "網站後台拒絕匯入：$($response.error)" }
  return $response.result
}

function Get-ProcessedKeys {
  $set = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  if (Test-Path -LiteralPath $StatePath) {
    try {
      $state = Get-Content -Raw -Encoding UTF8 -LiteralPath $StatePath | ConvertFrom-Json
      foreach ($key in @($state.processed)) { if ($key) { [void]$set.Add([string]$key) } }
    } catch {
      Write-Warning "無法讀取狀態檔，將由網站後台進行去重：$($_.Exception.Message)"
    }
  }
  Write-Output -NoEnumerate $set
}

function Save-ProcessedKeys {
  param([System.Collections.Generic.HashSet[string]]$Keys)

  $parent = Split-Path -Parent $StatePath
  if (-not (Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
  @{ updated_at = (Get-Date).ToString('o'); processed = @($Keys) } |
    ConvertTo-Json -Depth 4 |
    Set-Content -Encoding UTF8 -LiteralPath $StatePath
}

if (-not (Test-Path -LiteralPath $SourceFolder -PathType Container)) {
  throw "找不到來源資料夾：$SourceFolder"
}
if (-not $SkipAI -and -not $GeminiApiKey) {
  throw '缺少 GEMINI_API_KEY。若只測試郵件解析，請加上 -SkipAI -DryRun。'
}
if (-not $DryRun -and (-not $ApiUrl -or -not $IngestSecret)) {
  throw '正式匯入需要 AIHUB_CONTENT_API_URL 與 AIHUB_INGEST_SECRET。'
}

$processedKeys = Get-ProcessedKeys
$files = @(Get-ChildItem -LiteralPath $SourceFolder -Filter '*.msg' -File | Sort-Object LastWriteTime, Name)
if ($Limit -gt 0) { $files = @($files | Select-Object -First $Limit) }
$results = New-Object 'System.Collections.Generic.List[object]'
$outlook = $null

try {
  $outlook = New-Object -ComObject Outlook.Application
  foreach ($file in $files) {
    $message = $null
    try {
      $fileHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      $message = $outlook.Session.OpenSharedItem($file.FullName)
      $subject = ConvertTo-CleanText ([string]$message.Subject)
      $body = ConvertTo-CleanText ([string]$message.Body)
      $htmlBody = [string]$message.HTMLBody
      $urls = @(Get-MessageUrls -HtmlBody $htmlBody -TextBody $body)
      if (-not $urls.Count) { throw '郵件內找不到可用的 HTTP/HTTPS 網址。' }

      foreach ($sourceUrl in $urls) {
        $urlHashBytes = [Text.Encoding]::UTF8.GetBytes("$fileHash|$sourceUrl")
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $messageId = ([BitConverter]::ToString($sha.ComputeHash($urlHashBytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }

        if ($processedKeys.Contains($messageId)) {
          $results.Add([pscustomobject]@{ file = $file.Name; source_url = $sourceUrl; status = 'skipped'; detail = '已處理' })
          continue
        }

        $hints = Get-SourceHints $sourceUrl
        if ($SkipAI) {
          $draft = [pscustomobject]@{
            title = $subject
            summary = Get-FallbackSummary -Subject $subject -Body $body
            source_platform = $hints.platform
            source_author = $hints.author
            tool_name = ''
            tags = @('AI應用', '待人工整理', $hints.platform) | Where-Object { $_ }
            curator_note = '尚未呼叫 Gemini，請人工補充選讀重點。'
            source_publish_date = ''
            confidence = 'low'
            review_note = '目前為郵件解析測試資料，尚未經 AI 讀取原文。'
          }
        } else {
          $draft = Invoke-GeminiDraft -Subject $subject -Body $body -SourceUrl $sourceUrl -Hints $hints
        }

        $validatedToolName = [string]$draft.tool_name
        if ($validatedToolName -match '^(AI|人工智慧|生成式\s*AI|Generative\s*AI|LLM)$') {
          $validatedToolName = ''
          $draft.review_note = (([string]$draft.review_note + '；工具名稱只有泛稱，已自動清空。').Trim('；'))
        }
        if ($validatedToolName -and $GeminiModel -ne 'gemini-3.6-flash') {
          $sourceText = "$subject`n$body"
          if ($sourceText -notmatch [regex]::Escape($validatedToolName)) {
            $validatedToolName = ''
            $draft.review_note = (([string]$draft.review_note + '；AI 推測的工具名稱未出現在郵件內容中，已自動清空。').Trim('；'))
          }
        }

        $item = @{
          title = if ($draft.title) { [string]$draft.title } else { $subject }
          summary = if ($draft.summary) { [string]$draft.summary } else { Get-FallbackSummary -Subject $subject -Body $body }
          tags = (@($draft.tags) | Where-Object { $_ } | Select-Object -Unique) -join '，'
          publish_date = (Get-Date).ToString('yyyy/MM/dd')
          cover_image_url = ''
          source_url = $sourceUrl
          source_platform = if ($draft.source_platform) { [string]$draft.source_platform } else { $hints.platform }
          source_author = if ($draft.source_author) { [string]$draft.source_author } else { $hints.author }
          tool_name = $validatedToolName
          curator_note = "[AI 草稿] $([string]$draft.curator_note)"
          source_publish_date = [string]$draft.source_publish_date
          source_message_id = $messageId
          source_file = $file.Name
          ai_status = "confidence=$([string]$draft.confidence); $([string]$draft.review_note)".Trim()
        }

        if ($DryRun) {
          $results.Add([pscustomobject]@{ file = $file.Name; source_url = $sourceUrl; status = 'preview'; item = $item })
        } else {
          $ingest = Invoke-ContentIngest -Item $item
          [void]$processedKeys.Add($messageId)
          Save-ProcessedKeys $processedKeys
          $detail = if ($ingest.duplicate) { "後台已有相同內容（列 $($ingest.row)）" } else { "已建立草稿 $($ingest.content_id)" }
          $results.Add([pscustomobject]@{ file = $file.Name; source_url = $sourceUrl; status = 'ok'; detail = $detail })
        }
      }
    } catch {
      Write-Verbose $_.ScriptStackTrace
      $results.Add([pscustomobject]@{ file = $file.Name; source_url = ''; status = 'error'; detail = $_.Exception.Message })
    } finally {
      if ($message) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($message) }
    }
  }
} finally {
  if ($outlook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$results | ConvertTo-Json -Depth 12
