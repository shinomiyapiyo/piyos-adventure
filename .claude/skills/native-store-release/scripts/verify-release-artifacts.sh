#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-release-artifacts.sh — ビルド成果物を「実測」して報告するための道具
#
# なぜ要るか: gradlew の `UP-TO-DATE` は「ビルドされていない」という意味で、
#   気づかず前の版の AAB を提出しかけた事故がある。「ビルドできたはず」で報告しないための実測。
#
# 使い方:  bash verify-release-artifacts.sh [リポジトリのパス]   （既定 = カレント）
#          bash verify-release-artifacts.sh . --archive <xcarchiveのパス>
#
# 見るもの: 版数 / 同梱した web の版 / 混入の有無 / 署名 / サイズ
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO="${1:-.}"; shift 2>/dev/null || true
ARCHIVE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --archive) ARCHIVE="${2:-}"; shift 2;;
    *) shift;;
  esac
done
REPO="$(cd "$REPO" && pwd)"
echo "■ リポジトリ: $REPO"

# ── 宣言されている版数 ──────────────────────────────────────────────────────
echo
echo "===== 1. ソース上の版数 ====="
PBX="$REPO/ios/App/App.xcodeproj/project.pbxproj"
[ -f "$PBX" ] && grep -Eo "(MARKETING_VERSION|CURRENT_PROJECT_VERSION) = [^;]*;" "$PBX" | sort -u | sed 's/^/  iOS      /'
GRADLE="$REPO/android/app/build.gradle"
[ -f "$GRADLE" ] && grep -Eo "version(Code|Name) .*" "$GRADLE" | sed 's/^/  Android  /'

# ⚠iOS は Debug/Release の2か所ずつある。sort -u して1行ずつになっていなければ
#   片方だけ書き換わっている＝事故のもと。
IOSLINES=$([ -f "$PBX" ] && grep -Eo "MARKETING_VERSION = [^;]*;" "$PBX" | sort -u | wc -l | tr -d ' ' || echo 0)
[ "$IOSLINES" -gt 1 ] && echo "  ⚠ MARKETING_VERSION が複数種類ある＝片方しか書き換わっていない"

# ── Android AAB ────────────────────────────────────────────────────────────
echo
echo "===== 2. Android AAB ====="
AAB="$REPO/android/app/build/outputs/bundle/release/app-release.aab"
if [ ! -f "$AAB" ]; then
  echo "  （AAB が無い。まだビルドしていない）"
else
  echo "  パス: $AAB"
  echo "  更新: $(date -r "$AAB" '+%Y-%m-%d %H:%M:%S')   サイズ: $(du -h "$AAB" | cut -f1)"
  # ⚠更新時刻が今日でなければ、gradlew が UP-TO-DATE で素通りした可能性が高い
  [ -n "$(find "$AAB" -mtime +0 2>/dev/null)" ] && echo "  ⚠ 24時間以上前のファイル＝今回ビルドされていない疑い"

  TMP="$(mktemp -d)"; unzip -q "$AAB" -d "$TMP"
  PUB="$TMP/base/assets/public"
  if [ -d "$PUB" ]; then
    echo "  同梱物:"; ls "$PUB" | sed 's/^/    /'
    # 混入しがちなもの（作業用フォルダ・ツール・アーカイブ）
    for bad in node_modules tools ios android www .git build dist out; do
      [ -e "$PUB/$bad" ] && echo "    ⚠⚠ 混入: $bad"
    done
    find "$PUB" -iname "*.xcarchive" -o -iname "*.aab" -o -iname "*.ipa" 2>/dev/null | sed 's/^/    ⚠⚠ 混入: /'
    # web 側の版数（index.html に "Ver.x.y" 形式で書いてあるプロジェクト向け）
    [ -f "$PUB/index.html" ] && grep -oE 'Ver\.[0-9]+\.[0-9]+' "$PUB/index.html" | head -1 | sed 's/^/  同梱webの版: /'
  else
    echo "  ⚠ base/assets/public が無い（Capacitor の構成か確認）"
  fi
  ls "$TMP/META-INF" 2>/dev/null | grep -qi "\.RSA\|\.EC\|\.DSA" \
    && echo "  署名: ✓ あり（$(ls "$TMP/META-INF" | grep -i '\.RSA\|\.EC\|\.DSA' | tr '\n' ' ')）" \
    || echo "  署名: ⚠ 見つからない"
  rm -rf "$TMP"
fi

# ── iOS xcarchive ──────────────────────────────────────────────────────────
echo
echo "===== 3. iOS アーカイブ ====="
if [ -z "$ARCHIVE" ]; then
  # 当日ぶんから最新を拾う。無ければ全期間から最新。
  ARCHIVE="$(ls -dt "$HOME/Library/Developer/Xcode/Archives/"*/*.xcarchive 2>/dev/null | head -1)"
fi
if [ -z "$ARCHIVE" ] || [ ! -d "$ARCHIVE" ]; then
  echo "  （xcarchive が見つからない。まだアーカイブしていない）"
else
  echo "  パス: $ARCHIVE"
  echo "  更新: $(date -r "$ARCHIVE" '+%Y-%m-%d %H:%M:%S')"
  APP="$(ls -d "$ARCHIVE/Products/Applications/"*.app 2>/dev/null | head -1)"
  if [ -n "$APP" ]; then
    ASHORT="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist" 2>/dev/null)"
    ABUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist" 2>/dev/null)"
    ABID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null)"
    echo "  CFBundleIdentifier:         $ABID"
    echo "  CFBundleShortVersionString: $ASHORT"
    echo "  CFBundleVersion:            $ABUILD"
    # ⚠自動で拾うと**別アプリのアーカイブ**を掴むことがある（Xcodeは全プロジェクトを同じ場所に貯める）。
    #   このリポジトリの appId / 版数と突き合わせて、違えば止める。
    REPOID="$(sed -n 's/.*"appId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$REPO/capacitor.config.json" 2>/dev/null | head -1)"
    if [ -n "$REPOID" ] && [ -n "$ABID" ] && [ "$REPOID" != "$ABID" ]; then
      echo "  ⚠⚠ **別アプリのアーカイブです**（このリポジトリは $REPOID）。--archive で明示してください"
    fi
    MV="$(grep -Eo 'MARKETING_VERSION = [^;]*;' "$PBX" 2>/dev/null | head -1 | sed 's/.*= *//; s/;//')"
    if [ -n "$MV" ] && [ -n "$ASHORT" ] && [ "$MV" != "$ASHORT" ]; then
      echo "  ⚠ 版数がソース($MV)とアーカイブ($ASHORT)で食い違っています"
    fi
    echo "  サイズ: $(du -sh "$APP" | cut -f1)"
    if [ -d "$APP/public" ]; then
      for bad in node_modules tools ios android .git build dist out; do
        [ -e "$APP/public/$bad" ] && echo "    ⚠⚠ 混入: $bad"
      done
      [ -f "$APP/public/index.html" ] && grep -oE 'Ver\.[0-9]+\.[0-9]+' "$APP/public/index.html" | head -1 | sed 's/^/  同梱webの版: /'
    fi
  fi
fi

echo
echo "===== 判定のしかた ====="
cat <<'EOS'
  ・AAB と xcarchive の版数が、ソース上の宣言と一致しているか
  ・同梱webの版が「今回出したい版」になっているか（前の版のままなら build:web / cap sync 漏れ）
  ・⚠混入の行が1つも出ていないか
  ・AAB に署名があるか
  ・前回のサイズと比べて不自然に増えていないか（数百KB以上の増加は混入を疑う）
EOS
