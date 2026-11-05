# 포르투 생활 기록

iPhone(Edge 고정 탭)에서 쓰는 1년 생활 일지·가계부 웹앱. 단일 HTML, GitHub Pages로 연다.

- 앱: `index.html` — v1.3.0 (2026-11-05) · 같은 폰의 카미노 기록앱에서 10/31 이후 기록·GitHub 연결 이어받기 포함
- 시험 장치: `tests/smoke-porto.js` (Playwright, 모든 자료는 합성)

## 저장
- 기록은 이 저장소가 아니라 **각 폰의 브라우저**와 **별도 비공개 데이터 저장소**에만 쌓인다. 이 저장소에는 기록이 들어오지 않는다.
- 브라우저 저장 이름은 `porto:*` · IndexedDB `portoMedia`. 같은 주소(github.io)의 다른 앱 저장소는 건드리지 않는다.

## 시험
```
npm i playwright
node tests/smoke-porto.js index.html            # 합성 자료
node tests/smoke-porto.js index.html 백업.json  # 빠른 백업 파일로 전후 대조
```
320·390px 5탭 가로 넘침·JS 오류 · 다른 앱 저장소 불변 · 모르는 칸 보존(기기·동기화·백업) · 동영상 29/30/31초 · 사진 1280/1600px.
