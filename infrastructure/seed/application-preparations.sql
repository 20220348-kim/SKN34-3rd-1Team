-- 사용자 작업과 별개로 member 계정의 고정 목업 2건을 유지합니다.
-- 일반 작업(NULL 키)은 판단 대상에서 제외하며 기존 목업의 입력/작성본도 덮어쓰지 않습니다.
-- 동일 계정 행을 잠가 동시 시드 실행을 직렬화하고 신규 작업과 하위 데이터를 함께 커밋합니다.
SET NAMES utf8mb4;
SET @now := NOW(6);
START TRANSACTION;
SET @member := NULL;
SELECT id INTO @member FROM account WHERE email = 'member@govbiz.local' AND deleted_at IS NULL FOR UPDATE;
-- 계정 누락을 성공으로 숨기지 않습니다. NOT NULL 위반 시 연결 종료로 transaction이 rollback됩니다.
CREATE TEMPORARY TABLE application_seed_guard (account_id BIGINT NOT NULL);
INSERT INTO application_seed_guard VALUES (@member);
DROP TEMPORARY TABLE application_seed_guard;

SET @application_form_version := 'bizinfo-pbln-000000000118979-innovation-voucher-2026-v1';
SET @application_source_code := 'BIZINFO';
SET @application_source_program_id := 'PBLN_000000000118979';

SET @add_blank := NOT EXISTS (SELECT 1 FROM application_preparation WHERE owner_account_id = @member AND demo_seed_key = 'innovation-voucher-technical-v1');
INSERT INTO application_preparation (
    demo_seed_key, owner_account_id, source_code, source_program_id, form_version_id, service_field, input_revision,
    progress_stage, progress_revision, progress_stage_updated_at, created_at, updated_at
)
SELECT 'innovation-voucher-technical-v1', @member, @application_source_code, @application_source_program_id, @application_form_version, 'TECHNICAL_SUPPORT', 1,
    'PREPARING', 1, DATE_SUB(@now, INTERVAL 8 DAY), DATE_SUB(@now, INTERVAL 8 DAY), DATE_SUB(@now, INTERVAL 8 DAY)
WHERE @add_blank;

SET @add_active := NOT EXISTS (SELECT 1 FROM application_preparation WHERE owner_account_id = @member AND demo_seed_key = 'innovation-voucher-marketing-v1');
INSERT INTO application_preparation (
    demo_seed_key, owner_account_id, source_code, source_program_id, form_version_id, service_field, input_revision,
    progress_stage, progress_revision, progress_stage_updated_at, created_at, updated_at
)
SELECT 'innovation-voucher-marketing-v1', @member, @application_source_code, @application_source_program_id, @application_form_version, 'MARKETING', 4,
    'DOCUMENT_REVIEW', 3, DATE_SUB(@now, INTERVAL 1 DAY), DATE_SUB(@now, INTERVAL 12 DAY), DATE_SUB(@now, INTERVAL 1 DAY)
WHERE @add_active;
SET @preparation_active := LAST_INSERT_ID();

INSERT INTO application_preparation_fact (
    preparation_id, section_key, field_key, fact_status, value_text, source_text, input_revision, created_at, updated_at
)
SELECT @preparation_active, 'company-overview', 'company-name', 'PROVIDED', '넥스트웨이브 주식회사', '사업자등록증의 공식 상호는 넥스트웨이브 주식회사입니다.', 2, DATE_SUB(@now, INTERVAL 10 DAY), DATE_SUB(@now, INTERVAL 10 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'company-overview', 'contact-person', 'UNKNOWN', NULL, '신청 업무 담당자는 아직 정하지 않았습니다.', 2, DATE_SUB(@now, INTERVAL 10 DAY), DATE_SUB(@now, INTERVAL 10 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'company-overview', 'company-history', 'UNKNOWN', NULL, '주요 연혁은 증빙 자료를 확인한 뒤 입력하기로 했습니다.', 2, DATE_SUB(@now, INTERVAL 10 DAY), DATE_SUB(@now, INTERVAL 10 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'company-overview', 'main-products', 'UNKNOWN', NULL, '주요 생산품의 공식 표기는 아직 확인하지 못했습니다.', 2, DATE_SUB(@now, INTERVAL 10 DAY), DATE_SUB(@now, INTERVAL 10 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'company-overview', 'main-customers', 'UNKNOWN', NULL, '주요 판매처는 공개 가능한 범위를 확인하고 있습니다.', 2, DATE_SUB(@now, INTERVAL 10 DAY), DATE_SUB(@now, INTERVAL 10 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'voucher-plan', 'project-title', 'PROVIDED', '소상공인 상권분석 서비스 브랜드 고도화 및 시장 확장', '이번 과제명은 소상공인 상권분석 서비스 브랜드 고도화 및 시장 확장입니다.', 3, DATE_SUB(@now, INTERVAL 6 DAY), DATE_SUB(@now, INTERVAL 6 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'voucher-plan', 'project-details', 'UNKNOWN', NULL, '세부 수행 활동은 수행기관과 협의한 뒤 확정하기로 했습니다.', 3, DATE_SUB(@now, INTERVAL 6 DAY), DATE_SUB(@now, INTERVAL 6 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'voucher-plan', 'execution-period', 'UNKNOWN', NULL, '협약 일정이 나오지 않아 수행 기간은 아직 미정입니다.', 3, DATE_SUB(@now, INTERVAL 6 DAY), DATE_SUB(@now, INTERVAL 6 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'voucher-plan', 'project-goal', 'UNKNOWN', NULL, '정량 목표는 현재 내부 검토 중입니다.', 3, DATE_SUB(@now, INTERVAL 6 DAY), DATE_SUB(@now, INTERVAL 6 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'voucher-necessity', 'business-relevance', 'UNKNOWN', NULL, '기업활동과의 관련성 문안은 아직 확정하지 않았습니다.', 4, DATE_SUB(@now, INTERVAL 2 DAY), DATE_SUB(@now, INTERVAL 2 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'voucher-necessity', 'support-necessity', 'PROVIDED', '내부에 브랜드 전략과 광고 성과 분석 전문 인력이 없어 외부 전문 수행기관의 진단과 실행 지원이 필요합니다.', '내부에는 브랜드 전략과 광고 성과 분석을 전담할 전문 인력이 없습니다.', 4, DATE_SUB(@now, INTERVAL 2 DAY), DATE_SUB(@now, INTERVAL 2 DAY)
WHERE @add_active;

SET @company_overview_facts := JSON_ARRAY(
    JSON_OBJECT('fieldKey', 'company-history', 'status', 'UNKNOWN', 'value', NULL),
    JSON_OBJECT('fieldKey', 'company-name', 'status', 'PROVIDED', 'value', '넥스트웨이브 주식회사'),
    JSON_OBJECT('fieldKey', 'contact-person', 'status', 'UNKNOWN', 'value', NULL),
    JSON_OBJECT('fieldKey', 'main-customers', 'status', 'UNKNOWN', 'value', NULL),
    JSON_OBJECT('fieldKey', 'main-products', 'status', 'UNKNOWN', 'value', NULL)
);
SET @voucher_plan_facts := JSON_ARRAY(
    JSON_OBJECT('fieldKey', 'execution-period', 'status', 'UNKNOWN', 'value', NULL),
    JSON_OBJECT('fieldKey', 'project-details', 'status', 'UNKNOWN', 'value', NULL),
    JSON_OBJECT('fieldKey', 'project-goal', 'status', 'UNKNOWN', 'value', NULL),
    JSON_OBJECT('fieldKey', 'project-title', 'status', 'PROVIDED', 'value', '소상공인 상권분석 서비스 브랜드 고도화 및 시장 확장')
);

INSERT INTO application_preparation_content (
    preparation_id, section_key, input_revision, content_kind, content_text, facts_json, run_id, created_at, confirmed_at
)
SELECT @preparation_active, 'company-overview', 4, 'USER_EDIT',
     '신청 업체명은 넥스트웨이브 주식회사입니다. 담당자와 주요 연혁·생산품·판매처는 증빙과 공개 범위를 확인한 뒤 보완할 예정입니다.',
     @company_overview_facts, NULL, DATE_SUB(@now, INTERVAL 5 DAY), DATE_SUB(@now, INTERVAL 4 DAY)
WHERE @add_active
UNION ALL
SELECT @preparation_active, 'voucher-plan', 4, 'USER_EDIT',
     '과제명은 소상공인 상권분석 서비스 브랜드 고도화 및 시장 확장입니다. 세부 활동과 일정, 정량 목표는 수행기관과 협의한 뒤 보완할 예정입니다.',
     @voucher_plan_facts, NULL, DATE_SUB(@now, INTERVAL 1 DAY), NULL
WHERE @add_active;

COMMIT;
