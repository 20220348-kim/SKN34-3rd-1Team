# 도우미 자유 질문 의도 분류 회귀 평가

도우미 위젯의 자유 질문은 AI Service `POST /internal/v1/assistant/answers`가 여섯 의도
(`PRODUCT_HELP`·`ACCOUNT_STATE`·`SEARCH`·`PROGRAM_QUESTION`·`OUT_OF_SCOPE`·`UNCLEAR`) 중 하나로 분류하고,
Core가 그 의도에 맞는 답·이동을 만든다. 이 자료는 프롬프트나 모델을 바꿨을 때 **분류와 인용이 흔들리지 않는지**
확인하는 고정 질문 세트다. [계약과 흐름](../../docs/architecture.md)의 "도우미 자유 질문" 절을 참고한다.

이 자료는 **AI가 작성한 가상 질문 50개**이며 실제 사용자 질문이 아니고 사람 검증 정답도 아니다.
답 문장의 품질·말투는 측정하지 않으며, Core의 상태 답(관심 공고 수 등)이나 프런트 표시도 평가 범위 밖이다.

## 실행

프로젝트 루트에서 AI Service의 가상환경으로 실행한다. 기본 실행은 질문·도움말·요청 계약만 검증하고 모델을 부르지 않는다.

```bash
uv run --project backend/ai-service python evaluation/assistant/evaluate.py
uv run --project backend/ai-service python -m unittest discover -s evaluation/assistant -p 'test_*.py'
```

실제 분류는 `--live`로 측정한다. `OPENAI_API_KEY`(선택: `OPENAI_ASSISTANT_MODEL`·`OPENAI_ASSISTANT_REASONING_EFFORT`, 서비스와 같은 기본값 `gpt-5-nano`/`low`)가 필요하고 문항마다 한 번씩
호출하므로 비용이 든다. 요청 본문과 답변 문장은 보고서에 남기지 않는다.

```bash
uv run --project backend/ai-service python evaluation/assistant/evaluate.py --live --report evaluation/assistant/runs/<날짜>-v1/report.json
uv run --project backend/ai-service python evaluation/assistant/evaluate.py --live --split heldout
uv run --project backend/ai-service python evaluation/assistant/evaluate.py --live --case H02-1 --case N08
```

## 데이터

- `questions.json`: `id`, `message`, `expectedIntent`, `split`과 필요할 때 `expectedCitation`(사용법), `expectedAccountTopic`(상태),
  `session`·`context`(생략하면 `defaults`: 비로그인, `/` 화면)를 가진 문항 50개.
  - 사용법 30개: 챗봇 표면 도움말 10항목 × 표현 3개. 세 번째 표현은 `heldout`.
  - 회원 상태 4개, 검색 3개, 공고 질문 3개(공고 상세 화면·`programSelected: true`).
  - 답할 수 없는 10개: 범위 밖 7개(`OUT_OF_SCOPE`), 정보 부족 3개(`UNCLEAR`). 이 열 개에서 기권했는지가 `abstainRateOnUnanswerable`이다.
- 도움말 항목은 따로 복사하지 않고 실행할 때 `frontend/src/presentation/shared/help/helpContent.ts`에서 `chatbot` 표면의
  항목을 읽어 프런트가 보내는 것과 같은 모양으로 요청에 싣는다. 항목 id가 바뀌면 `expectedCitation`도 고쳐야 하며 검증 단계에서 걸린다.
- `dev`는 프롬프트를 고칠 때 보는 분할, `heldout`은 고친 뒤 한 번 확인하는 분할이다. `heldout`으로 프롬프트를 조정하면 더 이상
  미사용 검증 자료가 아니다. 같은 항목의 표현이 양쪽에 있으므로 독립적인 일반화 성능을 뜻하지 않는다.

## 보고서

`--live` 보고서의 `summary`:

| 지표 | 뜻 |
|---|---|
| `intentAccuracy` | 의도가 기대와 같은 비율(전체·`perIntent`·`perSplit`) |
| `helpCitationAccuracy` | 사용법 30문항에서 기대 도움말 id가 인용에 포함된 비율 |
| `accountTopicAccuracy` | 상태 4문항에서 `accountTopic`이 맞은 비율 |
| `abstainRateOnUnanswerable` | 답할 수 없는 10문항에서 `OUT_OF_SCOPE`·`UNCLEAR`로 기권한 비율(높을수록 좋음) |
| `falseAbstainRateOnAnswerable` | 답할 수 있는 40문항에서 기권한 비율(낮을수록 좋음) |

`confusion`은 기대 의도별로 실제 의도 분포를, `results`는 문항별 판정·지연을 담는다. 호출 실패는 `error`로 남고 점수에서 뺀다.
`questionsSha256`·`helpContentSha256`으로 어느 질문·도움말 버전으로 측정했는지 남긴다.

측정 기록: [luna/none 50/50](runs/intent-20260913-v1/README.md), [nano/minimal 28/50](runs/intent-20260914-v2-nano/README.md),
[nano/low 48/50](runs/intent-20260914-v3-nano-low/README.md). 서비스 기본값은 비용이 절반인 nano/low다. 보고서를 `runs/<날짜>-v1/`에 두고
같은 질문을 수정하지 않는다. 문항을 고치면 새 버전 디렉터리를 만든다.
