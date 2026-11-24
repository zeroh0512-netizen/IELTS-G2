# IELTS Speak: Even G2 스피킹 연습 앱

주제를 사진으로 찍으면 Claude가 IELTS Part 1/2/3 질문을 만들어 줍니다.
질문은 G2 안경 화면에 뜨고, 실제 시험 시간에 맞춘 타이머가 같이 돌아갑니다.

## 바로 쓰기 (설치 없음)
Even Realities 앱에서 아래 QR을 스캔하세요.

<img src="docs/qr.png" width="220" alt="QR code">

주소: https://zeroh0512-netizen.github.io/IELTS-G2/

## 흐름
1. 휴대폰 Even 앱 안에서 **Take photo**로 주제(큐카드, 교재 페이지, 메모 등)를 찍습니다. 주제를 직접 입력해도 됩니다.
2. **Generate questions**를 누르면 Claude(`claude-opus-5-5`)가 사진을 읽고 질문 세트를 만듭니다.
   - 사진에 실제 기출 문제가 있으면 문구를 그대로 쓰고, 빠진 파트만 채웁니다.
3. Full test 또는 Part 1, 2, 3 중 하나를 고르고, 안경을 **탭**해서 시작합니다.

## 안경 조작 (R1 링 또는 템플 터치)
| 동작 | 연습 중 | 대기·결과 화면 |
|---|---|---|
| 탭 | 다음 질문 / 다음 단계 | 시작 / 새 세션 |
| 더블탭 | 세션 종료 | 앱 종료 |

## 타이머 (실제 시험 기준)
| 파트 | 방식 | 시간 |
|---|---|---|
| Part 1 | 질문마다 경과 시간 표시 | 목표 0:30, 넘으면 `OVER` |
| Part 2 준비 | 카운트다운 | 1:00, 끝나면 말하기로 자동 전환 |
| Part 2 말하기 | 카운트다운 | 2:00, 15초 남으면 `WRAP UP`, 넘으면 `TIME UP +0:05` |
| Part 2 후속 질문 | 경과 시간 | 목표 0:30 |
| Part 3 | 질문마다 경과 시간 | 목표 1:00 |

답변은 안경 마이크로 녹음됩니다. 세션이 끝나면 휴대폰에서 답변별 소요 시간을 보고 녹음을 다시 들을 수 있습니다.
Part 2가 1:40보다 짧거나 Part 1 답변이 너무 길면 표시해 줍니다.

## 피드백 (세션이 끝난 뒤 휴대폰 화면)
1. **답변 텍스트 채우기**: 답변마다 칸이 있어요. 아래 두 방법 중 하나를 쓰면 됩니다.
   - 칸을 길게 눌러 **붙여넣기**합니다. 아이폰 받아쓰기나 다른 받아쓰기 앱의 결과를 쓰면 돼요.
   - 설정에 **Soniox 키**를 넣으면 말하는 동안 실시간으로 받아써지고, 휴대폰 화면에 자막처럼 보입니다. 세션이 끝나면 칸이 자동으로 채워져요. 틀린 부분은 직접 고칠 수 있습니다. Claude는 음성을 직접 들을 수 없어서 이 단계에 Soniox를 씁니다.
2. 두 가지 방법으로 피드백을 받을 수 있어요.
   - **Get feedback**: 앱 안에서 Claude가 채점합니다. Fluency, Vocabulary, Grammar 예상 밴드와 답변별 장단점, 문장 교정, Band 7.5~8 모범답안, 다음에 연습할 3가지를 보여 줍니다. 요약은 안경 화면에도 뜹니다.
   - **Copy for Claude app**: 채점 요청문, 질문, 답변, 시간, 멈춤 정보를 한 번에 복사합니다. Claude 앱에 붙여넣으면 이어서 대화하며 피드백을 받을 수 있어요.
3. 녹음을 분석해서 답변마다 실제 말한 시간과 1.5초 이상 멈춘 횟수, 가장 길게 멈춘 시간을 보여 줍니다. 이 정보도 채점에 반영됩니다.
4. 주제를 정할 때 **Paste** 버튼이나 입력칸 붙여넣기로 캡처 이미지나 문제 텍스트를 바로 넣을 수 있습니다.

발음은 텍스트로 판단할 수 없어서 점수에서 빠집니다.

## 직접 실행 (개발용)

압축을 푼 폴더에서 아래 명령을 실행합니다. Node.js 18 이상이 필요합니다.

```bash
cd ielts-g2
```

```bash
npm install
```

```bash
npm run dev
```

다른 터미널에서 QR을 띄운 뒤, Even Realities 앱으로 스캔합니다. 휴대폰과 PC가 같은 Wi-Fi에 있어야 합니다.

```bash
npm run qr
```

- 처음 실행할 때 **Anthropic API key** 칸에 키를 넣어 주세요. 키는 이 기기에만 저장됩니다.
- 안경 없이 PC 브라우저로 열면 "Browser preview" 모드가 됩니다. 위쪽 초록 화면이 안경 화면 미리보기이고, Space는 탭, Esc는 더블탭입니다.

## 베타로 배포 (Even Hub)
GitHub에 올릴 때마다 Actions가 `ielts-speak.ehpk`를 만들어 둡니다. Actions 실행 화면 아래 **Artifacts**에서 받을 수 있어요. 직접 만들려면 `npm run pack`을 실행합니다.

```bash
npx evenhub login
```

```bash
npx evenhub create ielts-speak.ehpk --icon icon.png
```

```bash
npx evenhub promote 0.4.0 --to beta
```

두 번째 버전부터는 `create` 대신 `upload`를 씁니다.

```bash
npx evenhub upload ielts-speak.ehpk -m "변경 내용"
```

패키지로 설치한 앱은 GitHub Pages가 아니라 패키지 안의 파일로 실행됩니다. 그래서 고친 내용을 반영하려면 `app.json`의 `version`을 올리고 다시 업로드해야 해요.

## 패키징

```bash
npm run pack
```

`ielts-speak.ehpk`가 만들어지고, Even Hub 개발자 포털에 올릴 수 있습니다.

## 참고
- 질문 생성 요청에는 server-side fallback(`fallbacks: "default"`)이 켜져 있습니다. Claude가 요청을 거절하면 다른 모델이 자동으로 이어받습니다.
- API 키를 앱 안에서 직접 사용하므로 개인용으로만 쓰세요. 배포하려면 키를 서버 쪽 프록시로 옮겨야 합니다.

## 파일 구성
- `src/glasses.ts`: G2 화면(헤더와 본문 텍스트 컨테이너), 링 입력, 마이크
- `src/session.ts`: 파트별 단계와 타이머 규칙
- `src/questions.ts`: Claude 호출 (사진 → 질문 JSON)
- `src/feedback.ts`: Claude 채점, Claude 앱용 복사 텍스트
- `src/soniox.ts`: Soniox 실시간 받아쓰기 (WebSocket)
- `src/audio.ts`: 16kHz PCM을 WAV로 변환
- `src/main.ts`: 휴대폰 UI와 진행 로직
