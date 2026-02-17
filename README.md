# Local API Docs

외부망 없이 내부망 Git 환경에서 팀이 함께 사용하는 로컬 API 문서 도구입니다.
Stoplight 스타일의 문서 뷰어 + API 테스트 기능을 순수 Node.js (외부 패키지 없음) 로 구현했습니다.

---

## 시작하기

### 1. 서버 실행

```bash
node server.js
```

### 2. 브라우저에서 접속

```
http://localhost:3000
```

> ⚠ `index.html` 을 파인더/탐색기에서 직접 더블클릭하면 보안 정책으로 API 파일이 로드되지 않습니다.
> 반드시 `node server.js` 를 먼저 실행한 뒤 위 주소로 접속하세요.

### 3. 서버 종료 (포트 끄기)

```bash
# macOS / Linux
lsof -ti :3000 | xargs kill -9

# 포트를 바꾼 경우 3000 자리에 해당 포트 번호 입력
lsof -ti :포트번호 | xargs kill -9
```

### 4. 포트 변경

`local.env` 파일에서 포트를 바꿀 수 있습니다.

```
PORT=3000
```

---

## 프로젝트 구조

```
local-apidocs/
├── index.html          # API 문서 뷰어
├── editor.html         # API 추가 / 수정 / 삭제 에디터
├── server.js           # 로컬 서버 (정적 파일 서빙 + API 프록시)
├── local.env           # 포트 설정
├── apis/
│   ├── index.json      # API 파일 목록 (자동 관리)
│   ├── auth.json       # 예시: Auth API
│   └── users.json      # 예시: Users API
└── public/
    ├── css/
    │   ├── pico.min.css
    │   ├── app.css
    │   └── editor.css
    └── js/
        ├── app.js
        └── editor.js
```

---

## 팀 공유 방법

1. API 문서를 추가하거나 수정한다 (`editor.html` 에서 Save)
2. `apis/` 폴더의 변경된 파일을 commit & push
3. 팀원이 pull 받은 뒤 `node server.js` 로 접속

---

## 기능

### 문서 뷰어 (`index.html`)

- 좌측 사이드바에서 그룹별 API 목록 탐색
- 검색으로 API 빠르게 찾기
- Request Headers / Query Parameters / Request Body / Response Example 표시
- JSON Syntax Highlight
- URL Hash 딥링크 지원 (`#파일명/엔드포인트id`)

### API 테스트

1. 우상단 **API Test OFF** 토글을 켠다
2. 서버가 실행 중이면 ✓ 표시, 아니면 실행 안내 표시
3. API 상세 화면에서 **▶ Try it out** 버튼 클릭
4. Base URL, Headers, Params, Body 입력 후 **Send Request**
5. 실제 응답 Status / Body 표시

> API 테스트는 `server.js` 의 `/proxy` 엔드포인트를 통해 CORS 없이 요청합니다.

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

### API 파일 형식

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
      "description": "...",
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

새 파일을 직접 만들 경우 `apis/index.json` 에도 파일명을 추가하세요.

```json
["auth.json", "users.json", "새파일.json"]
```
