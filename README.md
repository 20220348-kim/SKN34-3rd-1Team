# 🏛️ GovBiz

**LLM 기반 정부지원사업 탐색·신청 관리 플랫폼**

[기술 README · 실행 안내](docs/technical-readme.md) · [전체 문서 목록](docs/README.md) · [시스템 아키텍처](docs/architecture/README.md)

<!-- 팀 소개와 프로젝트 구성은 https://github.com/lsm15111/GovBiz-docs 의 README를 바탕으로 작성했습니다. -->

## 1. 팀 소개

### 👥 팀원 소개

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/ilil1.png" alt="김건우 GitHub 프로필" width="100" height="100"/><br>
      <b>김건우(팀장)</b><br>
      <a href="https://github.com/ilil1">
        <img src="https://img.shields.io/badge/GitHub-ilil1-181717?style=flat&logo=github"/>
      </a>
    </td>
    <td align="center">
      <img src="https://github.com/kimdongseop.png" alt="김동섭 GitHub 프로필" width="100" height="100"/><br>
      <b>김동섭</b><br>
      <a href="https://github.com/kimdongseop">
        <img src="https://img.shields.io/badge/GitHub-kimdongseop-181717?style=flat&logo=github"/>
      </a>
    </td>
    <td align="center">
      <img src="https://github.com/sungmin.png" alt="이성민 GitHub 프로필" width="100" height="100"/><br>
      <b>이성민</b><br>
      <a href="https://github.com/sungmin">
        <img src="https://img.shields.io/badge/GitHub-sungmin-181717?style=flat&logo=github"/>
      </a>
    </td>
    <td align="center">
      <img src="https://github.com/Genus-Jae.png" alt="송승재 GitHub 프로필" width="100" height="100"/><br>
      <b>송승재</b><br>
      <a href="https://github.com/Genus-Jae">
        <img src="https://img.shields.io/badge/GitHub-Genus--Jae-181717?style=flat&logo=github"/>
      </a>
    </td>
    <td align="center">
      <img src="https://github.com/JiYoon241111.png" alt="홍지윤 GitHub 프로필" width="100" height="100"/><br>
      <b>홍지윤</b><br>
      <a href="https://github.com/JiYoon241111">
        <img src="https://img.shields.io/badge/GitHub-JiYoon241111-181717?style=flat&logo=github"/>
      </a>
    </td>
  </tr>
</table>

## 2. 프로젝트 개요

### 📢 프로젝트 소개

GovBiz는 여러 정부기관과 공공 플랫폼에 분산된 지원사업 공고를 통합하고, 기업이 자신에게 적합한 사업을 탐색한 뒤 신청 준비와 진행 관리까지 이어갈 수 있도록 지원하는 AI 기반 정부지원사업 플랫폼입니다.

기업마당·K-Startup·과학기술정보통신부·충청남도 온라인수출지원시스템 등 공식 제공처의 공고를 수집·정규화하여 통합 검색 환경을 제공합니다. 사용자는 조건별 필터 검색과 AI 대화 검색을 통해 공고를 탐색하고, 공식 원문에 기반한 추천 이유와 신청 조건을 확인할 수 있습니다.

검색한 공고는 관심 공고함에 저장해 달력·목록으로 일정을 확인하고, 준비 중·지원 완료·서류 심사·발표 심사·선정·탈락 단계로 진행 상황을 관리할 수 있습니다. 또한 신청 문서 작성, 중복 지원·수혜 가능성 검토, 협업 파트너 모집과 제안 등의 기능을 통해 지원사업의 전 과정을 하나의 서비스에서 관리할 수 있도록 구성했습니다.

### 🏢 프로젝트 필요성

- 정부지원사업의 정보 분산으로 인하여 많은 시간이 소모됩니다.
- 공고마다 문서 형식과 표현 방식이 달라 정보 비교에 어려움이 있습니다.
- 단순 키워드 중심의 검색은 구체적인 상황을 충분히 반영하기 어렵습니다.
- AI 제공 추천 결과의 정확성과 신뢰성의 검증이 어렵습니다.
- 공고 탐색 후 별도로 공고를 관리하는데 어려움이 있습니다.
- 이력 존재 시 중복 지원 제한 여부를 개별적으로 확인하기 어렵습니다.
- 공동 참여 공고를 탐색하여도, 협업을 제안할 연결 수단이 부족합니다.

### 🎯 프로젝트 목표

1. 여러 공식 제공처의 지원사업 공고를 수집·정규화하여 하나의 서비스에서 검색할 수 있는 통합 환경을 제공합니다.
2. 키워드 검색과 의미 기반 검색을 결합하여 사용자의 기업 상황과 지원 목적에 적합한 공고 탐색을 제공합니다.
3. AI 대화 검색을 통해 모호한 요청은 추가 질문으로 구체화하고, 확인된 조건을 바탕으로 관련 공고를 추천합니다.
4. 추천 이유와 신청 조건을 공식 공고 원문에 기반해 제공하고, 검색 관련도와 실제 신청 자격을 구분하여 안내합니다.
5. 관심 공고를 달력과 목록으로 확인하고, 지원 완료부터 심사·선정·탈락까지 신청 진행 단계를 체계적으로 관리합니다.
6. 공식 첨부 양식을 분석하여 필요한 항목을 정리하고, 사용자가 확인한 정보를 반영해 지원 형식의 신청 문서를 생성합니다.
7. 사용자의 지원·수혜 이력과 공고 자료를 비교하여 중복 지원 제한 및 추가 확인이 필요한 사항을 검토합니다.
8. 지원사업별 협업 파트너 모집과 참여 제안 기능을 제공하여 공고 탐색을 실제 기업 간 협업으로 연결합니다.

### ✨ 차별화 전략

#### 검색부터 신청 이후까지 연결하는 통합 워크플로우

기존 지원사업 서비스가 공고 검색과 추천에 집중한다면, GovBiz는 공고 탐색 이후의 과정까지 하나의 흐름으로 연결합니다. 사용자는 관심 공고를 저장하고 접수 일정을 확인하며, 신청 문서를 준비하고 심사 결과까지 단계별로 관리할 수 있습니다.

> 지원사업 검색 → 근거·자격 확인 → 관심 공고 저장 → 신청 문서 작성 → 진행 단계 관리

#### 공식 원문을 기반으로 검증할 수 있는 AI

AI가 생성한 답변만 제공하지 않고, 추천 이유와 신청 조건을 공식 공고 원문에서 확인할 수 있도록 근거를 함께 제시합니다. 검색 결과와 실제 신청 자격을 구분하여 사용자가 AI의 판단을 직접 검토할 수 있도록 설계했습니다.

> 단순 AI 추천이 아닌, 공식 원문을 통해 확인할 수 있는 근거 중심의 지원사업 분석

#### 일회성 검색이 아닌 기업 맞춤형 지속 관리

기업의 지역·업종·설립 기간·지원 목적을 반영한 AI 대화 검색과 조건별 필터 검색을 함께 제공합니다. 저장된 기업 정보를 기반으로 맞춤 지원사업 리포트를 생성하고 이메일로도 제공하여, 사용자가 매번 새로운 공고를 직접 검색해야 하는 부담을 줄입니다.

> 사용자가 공고를 반복해서 찾는 방식에서 기업에 맞는 공고를 지속적으로 관리하는 방식으로 확장

#### 지원사업 참여의 위험과 협업까지 지원

여러 사업에 동시에 지원하거나 기존 수혜 사업이 있는 경우 공식 자료와 지원 이력을 비교하여 중복 지원·수혜 제한 가능성을 안내합니다. 또한 특정 공고를 기준으로 협업 기업을 모집하고 참여를 제안할 수 있어, 단독 신청뿐 아니라 기업 간 공동 참여까지 지원합니다.

> 공고 추천을 넘어 중복 위험 검토와 사업 중심의 기업 협업까지 지원

### 🔎 서비스 한눈에 보기

<table>
  <thead>
    <tr>
      <th width="180">구분</th>
      <th>내용</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>서비스명</b></td>
      <td>GovBiz</td>
    </tr>
    <tr>
      <td><b>서비스 정의</b></td>
      <td>정부지원사업 탐색부터 신청 준비와 협업까지 연결하는 AI 기반 플랫폼</td>
    </tr>
    <tr>
      <td><b>주요 사용자</b></td>
      <td>정부지원사업을 찾고 신청하려는 기업 및 사업 담당자</td>
    </tr>
    <tr>
      <td><b>검색 방식</b></td>
      <td>AI 대화 검색과 지역·분야·지원 대상 등을 선택하는 필터 검색</td>
    </tr>
    <tr>
      <td><b>핵심 기능</b></td>
      <td>통합 검색, 공고 분석, 맞춤 리포트, 관심 공고 관리, 신청 문서 작성, 중복 검토, 파트너 관리</td>
    </tr>
    <tr>
      <td><b>데이터 출처</b></td>
      <td>기업마당, K-Startup, 과학기술정보통신부, 충청남도 온라인수출지원시스템</td>
    </tr>
    <tr>
      <td><b>신뢰성 원칙</b></td>
      <td>공식 공고 원문과 확인 가능한 근거를 함께 제공</td>
    </tr>
    <tr>
      <td><b>서비스 흐름</b></td>
      <td>탐색 → 조건 확인 → 관심 공고 저장 → 신청 준비 → 진행 관리 → 협업</td>
    </tr>
  </tbody>
</table>

## 3. 기술 스택

### Frontend

![React 19](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=20232A)
![TypeScript 6](https://img.shields.io/badge/TypeScript_6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite 8](https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![React Router 8](https://img.shields.io/badge/React_Router_8-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Redux Toolkit](https://img.shields.io/badge/Redux_Toolkit-764ABC?style=for-the-badge&logo=redux&logoColor=white)
![Zod 4](https://img.shields.io/badge/Zod_4-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

### Backend · Core API

![Kotlin](https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![MyBatis](https://img.shields.io/badge/MyBatis-000000?style=for-the-badge)
![Flyway](https://img.shields.io/badge/Flyway-CC0200?style=for-the-badge)
![jsoup](https://img.shields.io/badge/jsoup-0F9D58?style=for-the-badge)
![BCrypt](https://img.shields.io/badge/BCrypt-4A154B?style=for-the-badge)

### AI Service

![Python 3.11+](https://img.shields.io/badge/Python_3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1C3C3C?style=for-the-badge&logo=langgraph&logoColor=white)
![Agents SDK](https://img.shields.io/badge/Agents_SDK-412991?style=for-the-badge)
![tiktoken](https://img.shields.io/badge/tiktoken-412991?style=for-the-badge)

AI 대화 검색의 조건 해석·공고 추천과 상세 근거 답변은 LangChain을 사용합니다. Qdrant 검색 결과를 프롬프트의 근거로 전달하며, 도구형 도우미에는 LangGraph, 자유 질문 분류에는 Agents SDK를 사용합니다.
Python은 3.11 이상을 지원하며 Docker 런타임은 3.12, CI는 3.11을 사용합니다.

### Data · Infrastructure

![MySQL 8.4](https://img.shields.io/badge/MySQL_8.4-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Elasticsearch 9](https://img.shields.io/badge/Elasticsearch_9-005571?style=for-the-badge&logo=elasticsearch&logoColor=white)
![Qdrant 1.17](https://img.shields.io/badge/Qdrant_1.17-DC244C?style=for-the-badge)
![Redis 8](https://img.shields.io/badge/Redis_8-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![RabbitMQ 4](https://img.shields.io/badge/RabbitMQ_4-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)

## 4. 주요 기능

| 기능 | 설명 |
|:---:|:---|
| 지원사업 통합 검색 | 여러 공식 제공처의 공고를 AI 대화 검색과 조건별 필터 검색으로 탐색 |
| 근거 기반 공고 분석 | 관련도·추천 이유·신청 조건을 제공하고 기업마당 공식 원문에 기반한 질의응답 지원 |
| 기업 맞춤 리포트 | 저장된 기업 정보를 기반으로 지원사업을 추천하고 웹·이메일 리포트 제공 |
| 관심 공고 관리 | 관심 공고를 달력과 목록으로 확인하고 신청 진행 단계를 체계적으로 관리 |
| 신청 문서 작성 | 공식 첨부 양식을 분석하고 사용자 확인 답변을 반영한 초안 작성·지원 형식의 문서 생성 및 다운로드 |
| 중복 지원·수혜 검토 | 복수 사업의 공식 자료와 지원 이력을 비교하여 제한 및 확인 필요 사항 안내 |
| 파트너 관리 | 공고별 협업 기업 모집과 참여 제안·수락·거절·철회 기능 제공 |

신청 문서 생성은 HWP·HWPX·PDF의 지원 구조에 한해 제공하며, HWP 편집에는 별도 Windows 브리지가 필요합니다. 세부 범위는 [문서 생성 안내](docs/application-document-mcp-architecture.md)에서 확인할 수 있습니다.

### 4-1. 서비스 이용 흐름

> 지원사업 탐색 → 근거 및 자격 확인 → 관심 공고 저장 → 신청 준비·진행 관리 → 중복 검토·파트너 협업

## 5. 시스템 아키텍처

<p align="center">
  <img
    src="docs/assets/architecture/govbiz-aws-architecture-deployed.png"
    alt="GovBiz 시스템 아키텍처"
    width="100%"
  />
</p>

### 📌 서비스 구성 및 운영 흐름

GovBiz는 Vercel과 AWS 환경에 배포할 수 있도록 프론트엔드, Core API, AI Service, 데이터 저장소를 분리하여 구성했습니다.

1. 사용자는 웹 브라우저를 통해 Vercel에 배포되는 React 프론트엔드에 접속합니다.
2. 프론트엔드의 `/api` 요청은 CloudFront를 거쳐 VPC 내부의 Nginx로 전달됩니다.
3. Nginx는 요청을 Spring Boot 기반 Core API로 프록시합니다.
4. Core API는 계정, 공고 검색, 관심 공고, 신청 관리 등 주요 업무를 처리합니다.
5. 대화 검색과 공고 분석이 필요한 요청은 FastAPI 기반 AI Service로 전달합니다.
6. 공고와 사용자 데이터는 Amazon RDS MySQL에 저장합니다.
7. Elasticsearch와 Qdrant는 키워드·의미 기반 검색에, Redis는 로그인 전 검색 결과 복원에, RabbitMQ는 비동기 작업 전달에 활용합니다.
8. 공고 데이터는 공공데이터포털 Open API에서 수집하며, AI 기능은 OpenAI API와 연동합니다.

### 📌 배포 흐름

- GitHub Actions가 프론트엔드, Core API, AI Service의 테스트와 빌드를 검증합니다.
- 배포 대상 저장소의 `main`에 코드가 반영되면 CodeConnections를 통해 CodeBuild가 백엔드를 검증하고 Docker 이미지를 Amazon ECR에 게시합니다.
- CodeBuild가 Systems Manager(SSM)에 배포 명령을 전달하면 EC2에서 해당 커밋의 이미지를 내려받아 Core API·AI Service를 교체합니다.
- 프론트엔드는 GitHub와 연동된 Vercel에서 별도로 빌드·배포합니다.
- 외부 API 요청은 CloudFront VPC origin과 Nginx를 거치며, EC2와 RDS는 VPC 내부 네트워크에 배치합니다.

자세한 구성과 배포 조건은 [AWS 배포 구성도](docs/assets/architecture/README-aws-deployed.md)와
[CodeBuild 배포 안내](docs/deployment-codebuild.md)를 참고하세요.

### 📌 로컬 개발 환경

- 개발용 Docker Compose에서 Vite·React, Spring Boot, FastAPI, MySQL, Elasticsearch, Qdrant, Redis, RabbitMQ를 함께 실행합니다.
- Nginx는 별도의 운영 Compose에 포함됩니다.
- 팀원은 동일한 컨테이너 구성으로 공고 수집부터 검색, AI 분석, 비동기 작업까지 전체 서비스 흐름을 재현할 수 있습니다.
- 로컬 환경과 배포 환경은 환경변수로 외부 API, 데이터베이스 및 서비스 연결 정보를 구분합니다.

설치 명령과 환경변수는 [기술 README의 빠른 시작](docs/technical-readme.md#빠른-시작)에서 확인할 수 있습니다.

## 6. ERD

<img width="1481" height="3235" alt="260916_ERD" src="https://github.com/user-attachments/assets/5b16e0de-a14f-428f-a8ef-44e62fcee3de" />

## 7. 📊 데이터 준비

GovBiz는 기업마당·K-Startup·과학기술정보통신부·충청남도 온라인수출지원시스템 등 여러 공식 제공처에 분산된 정부지원사업 공고를 수집하여 활용합니다. 제공처마다 다른 데이터 형식과 분류 기준을 공통 구조로 정규화하고, 키워드 검색과 의미 기반 검색에 사용할 수 있도록 색인합니다.

### 1) 데이터 출처

| 제공처 | 주요 데이터 | 수집 방식 |
|---|---|---|
| 기업마당 | 중앙부처·지자체·공공기관의 기업지원사업 공고 | 공공데이터포털 Open API |
| K-Startup | 창업기업 대상 지원사업 공고 | 공공데이터포털 Open API |
| 과학기술정보통신부 | 과학기술·연구개발 관련 사업 공고 | 공공데이터포털 Open API |
| 충청남도 온라인수출지원시스템 | 충청남도 기업 대상 수출지원사업 공고 | 공공데이터포털 Open API |

수집한 데이터는 검색과 자격 검토에 활용할 수 있도록 공고 제목, 주관기관, 신청 기간, 지원 지역, 지원 분야, 지원 대상, 공고 내용, 원문 URL 등의 항목으로 관리합니다.

### 2) 데이터 수집 및 정규화

제공처마다 서로 다른 필드명과 날짜·지역·분야 표현을 GovBiz의 공통 데이터 구조로 변환합니다.

- 제공처 코드와 원본 공고 ID를 조합하여 공고 식별
- 공고 제목과 주관기관명 정리
- 접수 시작일과 마감일 형식 통일
- 지역·지원 분야·지원 대상 분류 정규화
- 원문 URL과 첨부파일 정보 보존
- 필수 항목 및 전체 수집 건수 검증
- 동일 공고 재수집 시 기존 데이터를 갱신
- 제공처 수집 실패 시 기존 공개 데이터를 유지

접수 상태는 고정된 값으로 저장하지 않고, 신청 기간과 서울 기준 현재 날짜로 계산합니다. 접수 예정·접수 중·접수 마감과 상시·확인 필요 상태를 구분해 안내합니다.

### 3) 검색 데이터 구성

정규화가 완료된 공고는 서로 다른 검색 방식에 맞게 두 가지 형태로 색인합니다.

| 저장·검색 영역 | 활용 목적 |
|---|---|
| MySQL | 정규화된 공고 정보와 현재 공개 상태 관리 |
| Elasticsearch | 공고명·기관명·본문을 이용한 키워드 검색 |
| Qdrant | 공고 내용을 임베딩한 의미 기반 검색 |
| 원문 및 첨부파일 | 신청 조건 확인과 근거 기반 질의응답 |

Elasticsearch의 키워드 검색 결과와 Qdrant의 의미 기반 검색 결과를 결합하여 후보 공고를 찾고, AI가 사용자의 기업 상황 및 요청과의 관련성을 분석합니다.

### 4) 데이터 활용

수집·정규화된 공고 데이터는 다음 기능에 공통으로 활용됩니다.

- AI 대화 검색과 조건별 필터 검색
- 공고별 추천 이유와 신청 조건 확인
- 공식 원문 기반 공고 질의응답
- 기업 정보를 활용한 맞춤 지원사업 리포트
- 관심 공고의 접수 일정 및 진행 단계 관리
- 신청 문서의 항목과 첨부 양식 분석
- 중복 지원·수혜 제한 가능성 검토
- 지원사업별 협업 파트너 모집 및 제안

## 8. 공고 인덱싱 과정

### 공고 인덱싱 단계

<img width="1200" height="393" alt="260915_인덱싱단계" src="docs/assets/readme/indexing.png" />

## 9. 화면설계 | **UI 시안/UX Flow**

<img width="1970" height="1464" alt="화면흐름도(HOME)" src="https://github.com/user-attachments/assets/8d68144f-b4dc-4906-8e7c-6832f707f824" />

## 10. 폴더 구조

```text
GovBiz/
├── backend/
│   ├── core-api/                    # Kotlin·Spring Boot Core API
│   └── ai-service/                  # Python·FastAPI AI Service
├── frontend/                        # React·TypeScript 웹 애플리케이션
├── evaluation/
│   ├── assistant/                   # AI 어시스턴트 평가
│   ├── combination-review/          # 중복 지원·수혜 검토 평가
│   ├── support-program-evidence/    # 공고 근거 답변 평가
│   └── support-program-search/      # 검색 품질·성능 평가
├── infrastructure/
│   ├── codebuild/                   # AWS CodeBuild 설정
│   ├── document-mcp/                # 신청 문서 생성 환경
│   ├── elasticsearch/               # 키워드 검색 설정
│   ├── nginx/                       # API 프록시 설정
│   ├── scripts/                     # 실행·검증 스크립트
│   ├── seed/                        # 시연용 초기 데이터
│   ├── stubs/                       # 외부 API 테스트 서버
│   ├── compose.yaml                 # 로컬 실행 설정
│   └── compose.prod.yaml            # 배포 환경 설정
├── docs/
│   ├── architecture/                # 시스템 구조 문서
│   ├── assets/                      # README 이미지 리소스
│   ├── technical-readme.md          # 기존 README·빠른 시작·기술 문서 안내
│   └── *.md                         # 기능 설계·API 계약 문서
├── .github/                         # GitHub Actions CI 설정
├── .env.example                     # 환경변수 작성 예시
└── README.md                        # 프로젝트 안내 문서
```

각 폴더는 서비스 운영에 필요한 핵심 영역을 기준으로 구성되어 있습니다. 로컬 캐시, 가상환경, 임시 파일과 같은 개발 환경 전용 항목은 구조에서 제외했습니다.

## 11. 주요 문서

| 분류 | 문서 | 내용 |
|---|---|---|
| 기술·실행 | [기술 README](docs/technical-readme.md) | 기존 README의 기능 안내·빠른 시작·개발 및 운영 문서 |
| 시스템 | [시스템 아키텍처](docs/architecture/README.md) | 전체 시스템 구성과 서비스 간 연결 구조 |
| 기술 | [기술 구성](docs/technology.md) | 기술 스택과 주요 구현 방식 |
| 구현 | [구현 현황](docs/implementation-status.md) | 기능별 구현·검증 상태 |
| 검색 | [지원사업 검색 설계](docs/support-program-search-contract.md) | AI 검색 흐름과 공고 데이터 계약 |
| 신청 | [신청 준비 설계](docs/application-preparation-design.md) | 신청 양식 분석과 문서 작성 과정 |
| 검토 | [중복 지원·수혜 검토](docs/duplicate-support-review-design.md) | 복수 사업 비교 및 제한 검토 구조 |
| 배포 | [AWS·Vercel 배포](docs/assets/architecture/README-aws-deployed.md) · [CodeBuild](docs/deployment-codebuild.md) | 배포 구성과 백엔드 자동 배포 절차 |
| 기획 | [프로젝트 사업계획서](docs/govbiz-business-plan-v3.pdf) | 서비스 기획과 비즈니스 모델 |

## 12. 한 줄 회고

**김건우**
> 작성 예정

**김동섭**
> 작성 예정

**송승재**
> 작성 예정

**이성민**
> 작성 예정

**홍지윤**
> 작성 예정
