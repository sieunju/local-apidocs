# Local API Docs

외부망 없이 내부망 Git 환경에서 팀이 함께 사용하는 로컬 API 문서 도구입니다.
Stoplight 스타일의 문서 뷰어 + API 테스트 기능을 순수 Node.js (외부 패키지 없음) 로 구현했습니다.

---

## 주요 기능

- **API 문서 뷰어** — 그룹별 사이드바 탐색, 검색, 딥링크(URL Hash)
- **API 테스트** — DrawerLayout 방식의 Try it out 패널 (우측 슬라이드인)
  - Request Headers 자동완성 (Authorization, Content-Type 등)
  - Query Params URL Encode 토글
  - Request Body JSON 에디터 (CodeMirror, 구문 강조 + 유효성 검사)
  - Response JSON 트리 뷰어 (json-formatter)
  - `/proxy` 엔드포인트를 통한 CORS 우회
- **API 에디터** — 추가 / 수정 / 삭제, 실시간 Preview
- **오프라인 동작** — 모든 라이브러리 로컬 포함 (CDN 불필요)

---

## 프로젝트 구조

```
local-apidocs/
├── index.html          # API 문서 뷰어
├── editor.html         # API 추가 / 수정 / 삭제 에디터
├── server.js           # 로컬 서버 (정적 파일 서빙 + API 프록시)
├── local.env           # 서버 설정 (HOST, PORT) — gitignore 처리
├── apis/
│   ├── index.json      # API 파일 목록 (자동 관리)
│   └── *.json          # API 그룹별 스펙 파일
└── public/
    ├── css/
    │   ├── pico.min.css
    │   ├── app.css
    │   └── editor.css
    ├── js/
    │   ├── app.js
    │   └── editor.js
    └── lib/            # 로컬 라이브러리 (CodeMirror, json-formatter)
```

---

## 시작하기

### 1. local.env 설정

프로젝트 루트에 `local.env` 파일을 생성합니다.

```env
HOST=https://www.google.com
PORT=3000
```

- `HOST` — API 테스트 시 Base URL로 사용할 서버 주소
- `PORT` — 로컬 서버 포트 (기본값 `3000`)

> `local.env`는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.
> 팀원마다 각자의 환경에 맞게 설정하세요.

### 2. 서버 실행

```bash
node server.js
```

### 3. 브라우저에서 접속

```
http://localhost:3000
```

> ⚠ `index.html`을 파인더/탐색기에서 직접 더블클릭하면 보안 정책으로 API 파일이 로드되지 않습니다.
> 반드시 `node server.js`를 먼저 실행한 뒤 위 주소로 접속하세요.

### 4. 서버 종료

```bash
# macOS / Linux
lsof -ti :3000 | xargs kill -9

# 포트를 바꾼 경우
lsof -ti :포트번호 | xargs kill -9
```

---

## 사용 방법

### 문서 뷰어 (`index.html`)

- 좌측 사이드바에서 그룹별 API 목록 탐색
- 상단 검색창으로 API 빠르게 찾기
- Request Headers / Query Parameters / Request Body / Response Example 표시
- JSON Syntax Highlight
- URL Hash 딥링크 지원 (`#파일명/엔드포인트id`)

### API 테스트

1. 우상단 **API Test OFF** 토글을 켠다
2. 서버가 실행 중이면 ✓ 표시, 아니면 실행 안내 표시
3. API 상세 화면에서 **▶ Try it out** 버튼 클릭
4. 우측에서 슬라이드인되는 패널에서 Headers, Params, Body 입력
5. **Send Request** 클릭 → 실제 응답 Status / Body 표시

> API 테스트는 `server.js`의 `/proxy` 엔드포인트를 통해 CORS 없이 요청합니다.

### API 에디터 (`editor.html`)

- 우상단 **+ New API** 버튼으로 신규 추가
- 문서 화면의 **✏ Edit** 버튼으로 수정
- 입력 항목:
  - Method (GET / POST / PUT / PATCH / DELETE)
  - Path, Summary, Description
  - Request Headers — Key 자동완성 (Authorization, Content-Type 등)
  - Query Parameters — 필드별 Required / URL Encode 설정
  - Request Body — JSON 에디터 (유효성 검사 + Format 버튼)
  - Response Example — Status Code + JSON
- 우측 실시간 Preview
- 삭제 버튼 (수정 모드에서 표시)

---

## API 파일 형식

`apis/` 폴더에 JSON 파일 하나 = API 그룹 하나입니다.

```json
{
  "group": "Users",
  "description": "사용자 관련 API",
  "endpoints": [
    {
      "id": "get-users",
      "method": "GET",
      "path": "/api/users",
      "summary": "사용자 목록 조회",
      "description": "등록된 사용자 목록을 반환합니다.",
      "headers": [
        { "key": "Authorization", "value": "Bearer {token}", "required": true, "description": "" }
      ],
      "params": [
        { "key": "page", "value": "1", "required": false, "encode": false, "description": "페이지 번호" }
      ],
      "body": null,
      "response": {
        "status": 200,
        "example": { "success": true, "data": [] }
      }
    }
  ]
}
```

새 파일을 직접 만들 경우 `apis/index.json`에도 파일명을 추가하세요.

```json
["auth.json", "users.json", "새파일.json"]
```

> 에디터(`editor.html`)에서 저장하면 `apis/index.json`이 자동으로 업데이트됩니다.

---

## 팀 공유 방법

1. API 문서를 추가하거나 수정한다 (`editor.html`에서 Save)
2. `apis/` 폴더의 변경된 파일을 commit & push
3. 팀원이 pull 받은 뒤 `node server.js`로 접속

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 서버 | Node.js 내장 모듈만 사용 (외부 패키지 없음) |
| UI 프레임워크 | [Pico CSS](https://picocss.com/) |
| JSON 에디터 | [CodeMirror 5](https://codemirror.net/5/) |
| Response 뷰어 | [json-formatter-js](https://github.com/mohsen1/json-formatter-js) |
