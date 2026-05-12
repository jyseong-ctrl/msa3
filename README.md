# Orthologue — Protein MSA web app

Ensembl REST API에서 사람 유전자의 직교상동(ortholog) 단백질 서열을 가져오고, EBI Clustal Omega로 다중 서열 정렬(MSA)을 수행하는 Next.js 웹 앱입니다.

브라우저에서 유전자 이름 입력 → 종 선택 → 정렬 결과 확인까지 한 번에 처리합니다.

## 데모 배포 (Vercel)

이 저장소를 Vercel에 그대로 연결하면 자동 배포됩니다:

1. GitHub에 푸시
2. [vercel.com/new](https://vercel.com/new) → 저장소 import
3. Framework Preset: **Next.js** (자동 감지됨)
4. Deploy

별도의 환경 변수는 필요 없습니다.

## 로컬 개발

```bash
npm install
npm run dev
# → http://localhost:3000
```

## 기술 스택

- **Next.js 14** (App Router)
- **TypeScript** (strict)
- **Tailwind CSS 3**
- **next/font** — Newsreader + JetBrains Mono (Google Fonts)

## 디렉터리 구조

```
.
├── app/
│   ├── api/
│   │   ├── run/route.ts      # POST: orthologs 가져오기 + Clustal Omega 제출
│   │   ├── status/route.ts   # GET: 작업 상태 폴링
│   │   └── result/route.ts   # GET: 정렬 결과 + identity 계산
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx              # 메인 UI
├── lib/
│   └── msa.ts                # Ensembl/Clustal 핵심 로직
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## API 엔드포인트

### `POST /api/run`

요청 본문:
```json
{
  "gene": "TP53",
  "species": ["mus_musculus", "rattus_norvegicus"],
  "signalPeptideMode": "include",
  "email": "you@example.com"
}
```

응답:
```json
{
  "jobId": "clustalo-...",
  "fasta": ">human ...",
  "records": [...],
  "missing": [],
  "resolvedQuery": { "geneId": "ENSG00000141510", "symbol": "TP53", ... }
}
```

### `GET /api/status?jobId=...`

```json
{ "jobId": "...", "status": "FINISHED" }
```

가능한 상태값: `PENDING`, `RUNNING`, `FINISHED`, `ERROR`, `FAILURE`, `NOT_FOUND`.

### `GET /api/result?jobId=...`

```json
{
  "alignment": "CLUSTAL O(...)...",
  "parsed": { "human": "MEEPQS...", "mus_musculus": "..." },
  "identity": [
    { "species": "chimpanzee", "identity": 99.6, "matches": 391, "comparedResidues": 393 }
  ]
}
```

## 데이터 출처

- [Ensembl REST API](https://rest.ensembl.org)
- [Ensembl BioMart](https://www.ensembl.org/biomart/martservice)
- [EBI Clustal Omega REST](https://www.ebi.ac.uk/Tools/services/rest/clustalo)

각 서비스의 이용약관과 호출 제한을 준수해 주세요. Clustal Omega 사용 시 가능하면 본인 이메일을 입력해 EBI가 작업을 식별할 수 있게 해주세요.

## 라이선스

MIT — [LICENSE](./LICENSE) 참고.
