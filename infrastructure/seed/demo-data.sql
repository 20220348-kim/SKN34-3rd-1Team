-- 로컬 개발용 데모 데이터입니다. 실제 서비스처럼 보이도록 계정 22개, 기업 16개, 파트너 모집글 6개, 제안 11개,
-- 관심 공고 5개, 중복 지원 검토 2개, 신청 준비 2개를 넣습니다.
-- 모집글은 이미 수집된 기업마당 공고(접수 마감이 3주 이상 남은 것) 6건에 붙이므로 공고 동기화가 끝난 뒤 실행해야 합니다.
-- 여러 번 실행해도 됩니다. `@demo.govbiz.local` 계정과 개발용 시드 계정(admin·member)의 기업·모집글·제안·관심 공고·중복 검토·신청 준비를 지우고 다시 넣습니다.
-- 그 밖의 계정(직접 가입한 실제 이메일 등)은 읽지도 지우지도 않습니다.
-- 실행: Compose의 demo-seed 서비스가 첫 기동 때 자동으로(다시 넣기는 DEMO_SEED_FORCE=true), 또는 ./infrastructure/scripts/seed-demo-data.sh로 직접
--       (infrastructure/README.md "데모 데이터" 참고)
--
-- 비밀번호: 데모 계정은 govbiz-demo1, 개발용 시드 계정은 govbiz-admin1(ACCOUNT_DEV_LOGIN_PASSWORD 기본값)입니다.
-- 소셜 로그인으로만 가입한 계정 3개는 비밀번호가 없어 개발용 로그인이나 관리자 화면으로만 봅니다.
-- 기업명·사업자등록번호·이메일은 모두 가상입니다.

SET NAMES utf8mb4;
SET @demo_hash := '$2a$10$MutwU78LwuJgCTNldqlOruNXsnofK/dclRgKluD.84GMqdfncunfS';
SET @seed_hash := '$2a$10$PqUXt/yc4Iq00afd4oYpy.LLEy/aA7zkurK/H4xXa8zhOu10eCl9G';
SET @now := NOW(6);

-- ---------------------------------------------------------------------------------------------------------------------
-- 0. 모집글을 붙일 공고 6건. 접수 마감이 3주 이상 남은 기업마당 공고 중 마감이 늦은 순입니다. 부족하면 멈춥니다.
-- ---------------------------------------------------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS seed_program;
CREATE TEMPORARY TABLE seed_program AS
SELECT id, application_end_date, ROW_NUMBER() OVER (ORDER BY application_end_date DESC, id) AS seq
FROM (
    SELECT id, application_end_date
    FROM support_program
    WHERE source_code = 'BIZINFO'
      AND application_end_date >= DATE_ADD(CURDATE(), INTERVAL 21 DAY)
    ORDER BY application_end_date DESC, id
    LIMIT 6
) candidate;

-- 공고가 6건보다 적으면 CHECK 제약 위반으로 여기서 멈춥니다(공고 동기화가 끝났는지 확인하세요).
DROP TEMPORARY TABLE IF EXISTS seed_guard;
CREATE TEMPORARY TABLE seed_guard (
    open_bizinfo_programs INT NOT NULL,
    CONSTRAINT chk_seed_needs_six_open_bizinfo_programs CHECK (open_bizinfo_programs = 6)
);
INSERT INTO seed_guard (open_bizinfo_programs) SELECT COUNT(*) FROM seed_program;
DROP TEMPORARY TABLE seed_guard;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. 이전 데모 데이터 정리. 계정을 지우면 세션·소셜 연결·기업·모집글·제안·조치 기록이 FK CASCADE로 함께 지워집니다.
--    개발용 시드 계정은 남기고 그 기업(과 딸린 모집글·제안)만 지웁니다.
-- ---------------------------------------------------------------------------------------------------------------------
DELETE FROM account WHERE email LIKE '%@demo.govbiz.local';
DELETE combination_review FROM combination_review
    JOIN account ON account.id = combination_review.owner_account_id
WHERE account.email IN ('admin@govbiz.local', 'member@govbiz.local');
DELETE application_preparation FROM application_preparation
    JOIN account ON account.id = application_preparation.owner_account_id
WHERE account.email IN ('admin@govbiz.local', 'member@govbiz.local')
  AND COALESCE(@reset_application_preparations, 0) = 1;
DELETE company FROM company
    JOIN account ON account.id = company.account_id
WHERE account.email IN ('admin@govbiz.local', 'member@govbiz.local');
DELETE account_admin_action FROM account_admin_action
    JOIN account ON account.id = account_admin_action.admin_account_id
WHERE account.email = 'admin@govbiz.local';
DELETE saved_support_program FROM saved_support_program
    JOIN account ON account.id = saved_support_program.account_id
WHERE account.email IN ('admin@govbiz.local', 'member@govbiz.local');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. 계정 22개. 개발용 시드 계정 2개는 없을 때만 만들고(있으면 그대로), 데모 계정 20개를 넣습니다.
-- ---------------------------------------------------------------------------------------------------------------------
INSERT IGNORE INTO account (email, password_hash, role, email_verified_at, terms_agreed_at, created_at, last_login_at)
VALUES ('admin@govbiz.local', @seed_hash, 'ADMIN', DATE_SUB(@now, INTERVAL 180 DAY), DATE_SUB(@now, INTERVAL 180 DAY), DATE_SUB(@now, INTERVAL 180 DAY), DATE_SUB(@now, INTERVAL 1 HOUR)),
       ('member@govbiz.local', @seed_hash, 'USER', DATE_SUB(@now, INTERVAL 120 DAY), DATE_SUB(@now, INTERVAL 120 DAY), DATE_SUB(@now, INTERVAL 120 DAY), DATE_SUB(@now, INTERVAL 2 HOUR));
SET @admin := (SELECT id FROM account WHERE email = 'admin@govbiz.local');
SET @member := (SELECT id FROM account WHERE email = 'member@govbiz.local');

-- 이메일·비밀번호 가입 계정 17개. created_at은 최근 6개월에 흩고, 최근 로그인은 일부만 남깁니다.
INSERT INTO account (email, password_hash, role, email_verified_at, terms_agreed_at, created_at, last_login_at) VALUES
    ('jihoon.park@demo.govbiz.local',   @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 150 DAY), DATE_SUB(@now, INTERVAL 151 DAY), DATE_SUB(@now, INTERVAL 151 DAY), DATE_SUB(@now, INTERVAL 3 HOUR)),
    ('seoyeon.kim@demo.govbiz.local',   @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 140 DAY), DATE_SUB(@now, INTERVAL 140 DAY), DATE_SUB(@now, INTERVAL 140 DAY), DATE_SUB(@now, INTERVAL 1 DAY)),
    ('minjun.lee@demo.govbiz.local',    @demo_hash, 'USER', NULL,                              DATE_SUB(@now, INTERVAL 133 DAY), DATE_SUB(@now, INTERVAL 133 DAY), DATE_SUB(@now, INTERVAL 9 DAY)),
    ('hana.choi@demo.govbiz.local',     @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 121 DAY), DATE_SUB(@now, INTERVAL 122 DAY), DATE_SUB(@now, INTERVAL 122 DAY), DATE_SUB(@now, INTERVAL 5 HOUR)),
    ('dohyun.jung@demo.govbiz.local',   @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 110 DAY), DATE_SUB(@now, INTERVAL 110 DAY), DATE_SUB(@now, INTERVAL 110 DAY), DATE_SUB(@now, INTERVAL 2 DAY)),
    ('yuna.kang@demo.govbiz.local',     @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 98 DAY),  DATE_SUB(@now, INTERVAL 99 DAY),  DATE_SUB(@now, INTERVAL 99 DAY),  DATE_SUB(@now, INTERVAL 20 DAY)),
    ('sua.yoon@demo.govbiz.local',      @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 84 DAY),  DATE_SUB(@now, INTERVAL 84 DAY),  DATE_SUB(@now, INTERVAL 84 DAY),  DATE_SUB(@now, INTERVAL 30 MINUTE)),
    ('taeyang.oh@demo.govbiz.local',    @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 77 DAY),  DATE_SUB(@now, INTERVAL 78 DAY),  DATE_SUB(@now, INTERVAL 78 DAY),  DATE_SUB(@now, INTERVAL 6 HOUR)),
    ('eunji.lim@demo.govbiz.local',     @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 66 DAY),  DATE_SUB(@now, INTERVAL 66 DAY),  DATE_SUB(@now, INTERVAL 66 DAY),  DATE_SUB(@now, INTERVAL 11 DAY)),
    ('junseo.shin@demo.govbiz.local',   @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 58 DAY),  DATE_SUB(@now, INTERVAL 59 DAY),  DATE_SUB(@now, INTERVAL 59 DAY),  DATE_SUB(@now, INTERVAL 3 DAY)),
    ('hyunwoo.bae@demo.govbiz.local',   @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 45 DAY),  DATE_SUB(@now, INTERVAL 45 DAY),  DATE_SUB(@now, INTERVAL 45 DAY),  DATE_SUB(@now, INTERVAL 4 DAY)),
    ('nayeon.moon@demo.govbiz.local',   @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 33 DAY),  DATE_SUB(@now, INTERVAL 34 DAY),  DATE_SUB(@now, INTERVAL 34 DAY),  DATE_SUB(@now, INTERVAL 1 HOUR)),
    ('siwoo.hwang@demo.govbiz.local',   @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 5 DAY),   DATE_SUB(@now, INTERVAL 5 DAY),   DATE_SUB(@now, INTERVAL 5 DAY),   DATE_SUB(@now, INTERVAL 5 DAY)),
    ('minseo.kwon@demo.govbiz.local',   @demo_hash, 'USER', NULL,                              DATE_SUB(@now, INTERVAL 6 DAY),   DATE_SUB(@now, INTERVAL 6 DAY),   DATE_SUB(@now, INTERVAL 6 DAY)),
    ('yejin.ryu@demo.govbiz.local',     @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 40 DAY),  DATE_SUB(@now, INTERVAL 41 DAY),  DATE_SUB(@now, INTERVAL 41 DAY),  NULL),
    ('sangmin.go@demo.govbiz.local',    @demo_hash, 'USER', NULL,                              DATE_SUB(@now, INTERVAL 25 DAY),  DATE_SUB(@now, INTERVAL 25 DAY),  NULL),
    ('areum.na@demo.govbiz.local',      @demo_hash, 'USER', DATE_SUB(@now, INTERVAL 1 DAY),   DATE_SUB(@now, INTERVAL 1 DAY),   DATE_SUB(@now, INTERVAL 1 DAY),   DATE_SUB(@now, INTERVAL 1 DAY));

-- 소셜 로그인으로만 가입한 계정 3개. 비밀번호가 없고 공급자가 인증한 이메일이라 인증 완료입니다.
INSERT INTO account (email, password_hash, role, email_verified_at, terms_agreed_at, created_at, last_login_at) VALUES
    ('woojin.han@demo.govbiz.local',    NULL, 'USER', DATE_SUB(@now, INTERVAL 90 DAY), DATE_SUB(@now, INTERVAL 90 DAY), DATE_SUB(@now, INTERVAL 90 DAY), DATE_SUB(@now, INTERVAL 12 HOUR)),
    ('chaewon.song@demo.govbiz.local',  NULL, 'USER', DATE_SUB(@now, INTERVAL 52 DAY), DATE_SUB(@now, INTERVAL 52 DAY), DATE_SUB(@now, INTERVAL 52 DAY), DATE_SUB(@now, INTERVAL 2 DAY)),
    ('jiwoo.seo@demo.govbiz.local',     NULL, 'USER', DATE_SUB(@now, INTERVAL 3 DAY),  DATE_SUB(@now, INTERVAL 3 DAY),  DATE_SUB(@now, INTERVAL 3 DAY),  DATE_SUB(@now, INTERVAL 3 DAY));

SET @jihoon  := (SELECT id FROM account WHERE email = 'jihoon.park@demo.govbiz.local');
SET @seoyeon := (SELECT id FROM account WHERE email = 'seoyeon.kim@demo.govbiz.local');
SET @minjun  := (SELECT id FROM account WHERE email = 'minjun.lee@demo.govbiz.local');
SET @hana    := (SELECT id FROM account WHERE email = 'hana.choi@demo.govbiz.local');
SET @dohyun  := (SELECT id FROM account WHERE email = 'dohyun.jung@demo.govbiz.local');
SET @yuna    := (SELECT id FROM account WHERE email = 'yuna.kang@demo.govbiz.local');
SET @sua     := (SELECT id FROM account WHERE email = 'sua.yoon@demo.govbiz.local');
SET @taeyang := (SELECT id FROM account WHERE email = 'taeyang.oh@demo.govbiz.local');
SET @eunji   := (SELECT id FROM account WHERE email = 'eunji.lim@demo.govbiz.local');
SET @junseo  := (SELECT id FROM account WHERE email = 'junseo.shin@demo.govbiz.local');
SET @hyunwoo := (SELECT id FROM account WHERE email = 'hyunwoo.bae@demo.govbiz.local');
SET @nayeon  := (SELECT id FROM account WHERE email = 'nayeon.moon@demo.govbiz.local');
SET @woojin  := (SELECT id FROM account WHERE email = 'woojin.han@demo.govbiz.local');
SET @chaewon := (SELECT id FROM account WHERE email = 'chaewon.song@demo.govbiz.local');
SET @jiwoo   := (SELECT id FROM account WHERE email = 'jiwoo.seo@demo.govbiz.local');

INSERT INTO account_oauth_identity (account_id, provider, subject, linked_at) VALUES
    (@woojin,  'KAKAO',  '3412098771', DATE_SUB(@now, INTERVAL 90 DAY)),
    (@chaewon, 'GOOGLE', '109874412563308841977', DATE_SUB(@now, INTERVAL 52 DAY)),
    (@jiwoo,   'KAKAO',  '3577120064', DATE_SUB(@now, INTERVAL 3 DAY));

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. 기업 15개(시드 회원 1 + 데모 14). 사업자등록번호는 가상이며 모두 계속사업자로 확인된 상태입니다.
-- ---------------------------------------------------------------------------------------------------------------------
INSERT INTO company (account_id, business_number, company_name, business_status, business_status_code, region, industry, founded_year, homepage_url, business_verified_at, created_at, updated_at) VALUES
    (@member,  '2148812034', '넥스트웨이브 주식회사', '계속사업자', '01', '서울특별시', '정보통신업', 2020, 'https://nextwave.example', DATE_SUB(@now, INTERVAL 118 DAY), DATE_SUB(@now, INTERVAL 118 DAY), DATE_SUB(@now, INTERVAL 30 DAY)),
    (@jihoon,  '1208734519', '데이터브릿지 주식회사', '계속사업자', '01', '서울특별시', '정보통신업', 2021, 'https://databridge.example', DATE_SUB(@now, INTERVAL 149 DAY), DATE_SUB(@now, INTERVAL 149 DAY), DATE_SUB(@now, INTERVAL 149 DAY)),
    (@seoyeon, '1318605827', '비전솔루션', '계속사업자', '01', '경기도', '정보통신업', 2019, NULL, DATE_SUB(@now, INTERVAL 139 DAY), DATE_SUB(@now, INTERVAL 139 DAY), DATE_SUB(@now, INTERVAL 60 DAY)),
    (@minjun,  '6078157203', '그린푸드랩', '계속사업자', '01', '부산광역시', '제조업', 2018, 'https://greenfoodlab.example', DATE_SUB(@now, INTERVAL 130 DAY), DATE_SUB(@now, INTERVAL 130 DAY), DATE_SUB(@now, INTERVAL 130 DAY)),
    (@hana,    '6098246118', '한빛정밀', '계속사업자', '01', '경상남도', '제조업', 2012, NULL, DATE_SUB(@now, INTERVAL 121 DAY), DATE_SUB(@now, INTERVAL 121 DAY), DATE_SUB(@now, INTERVAL 121 DAY)),
    (@dohyun,  '3148937762', '마루헬스케어', '계속사업자', '01', '대전광역시', '보건업 및 사회복지 서비스업', 2020, 'https://maruhealth.example', DATE_SUB(@now, INTERVAL 108 DAY), DATE_SUB(@now, INTERVAL 108 DAY), DATE_SUB(@now, INTERVAL 15 DAY)),
    (@yuna,    '1318128490', '오션로지스', '계속사업자', '01', '인천광역시', '운수 및 창고업', 2015, NULL, DATE_SUB(@now, INTERVAL 97 DAY), DATE_SUB(@now, INTERVAL 97 DAY), DATE_SUB(@now, INTERVAL 97 DAY)),
    (@woojin,  '3018155904', '세종에듀테크', '계속사업자', '01', '세종특별자치시', '교육 서비스업', 2022, 'https://sejongedu.example', DATE_SUB(@now, INTERVAL 88 DAY), DATE_SUB(@now, INTERVAL 88 DAY), DATE_SUB(@now, INTERVAL 88 DAY)),
    (@sua,     '3018862271', '누리바이오', '계속사업자', '01', '충청북도', '전문, 과학 및 기술 서비스업', 2017, 'https://nuribio.example', DATE_SUB(@now, INTERVAL 83 DAY), DATE_SUB(@now, INTERVAL 83 DAY), DATE_SUB(@now, INTERVAL 10 DAY)),
    (@taeyang, '5058143365', '코어팩토리', '계속사업자', '01', '경상북도', '제조업', 2010, NULL, DATE_SUB(@now, INTERVAL 76 DAY), DATE_SUB(@now, INTERVAL 76 DAY), DATE_SUB(@now, INTERVAL 76 DAY)),
    (@eunji,   '4108194427', '블루윈드에너지', '계속사업자', '01', '전라남도', '전기, 가스, 증기 및 공기 조절 공급업', 2016, NULL, DATE_SUB(@now, INTERVAL 65 DAY), DATE_SUB(@now, INTERVAL 65 DAY), DATE_SUB(@now, INTERVAL 65 DAY)),
    (@junseo,  '4028671950', '소담푸드', '계속사업자', '01', '전북특별자치도', '제조업', 2019, 'https://sodamfood.example', DATE_SUB(@now, INTERVAL 57 DAY), DATE_SUB(@now, INTERVAL 57 DAY), DATE_SUB(@now, INTERVAL 57 DAY)),
    (@chaewon, '2118873346', '라온소프트', '계속사업자', '01', '서울특별시', '정보통신업', 2023, 'https://raonsoft.example', DATE_SUB(@now, INTERVAL 50 DAY), DATE_SUB(@now, INTERVAL 50 DAY), DATE_SUB(@now, INTERVAL 7 DAY)),
    (@hyunwoo, '5148712088', '제이앤디자인', '계속사업자', '01', '대구광역시', '전문, 과학 및 기술 서비스업', 2014, NULL, DATE_SUB(@now, INTERVAL 44 DAY), DATE_SUB(@now, INTERVAL 44 DAY), DATE_SUB(@now, INTERVAL 44 DAY)),
    (@nayeon,  '1358166119', '큐브로보틱스', '계속사업자', '01', '경기도', '제조업', 2021, 'https://cuberobotics.example', DATE_SUB(@now, INTERVAL 33 DAY), DATE_SUB(@now, INTERVAL 33 DAY), DATE_SUB(@now, INTERVAL 33 DAY));

-- 개발용 관리자 계정도 기업을 하나 가져 기업 회원 화면(제안 보내기 등)을 관리자 세션으로 바로 볼 수 있게 합니다. 가상 기업입니다.
INSERT INTO company (account_id, business_number, company_name, business_status, business_status_code, region, industry, founded_year, homepage_url, business_verified_at, created_at, updated_at) VALUES
    (@admin, '2208800113', '거북섬테크 주식회사', '계속사업자', '01', '서울특별시', '정보통신업', 2021, NULL, DATE_SUB(@now, INTERVAL 170 DAY), DATE_SUB(@now, INTERVAL 170 DAY), DATE_SUB(@now, INTERVAL 170 DAY));

SET @c_admin   := (SELECT id FROM company WHERE account_id = @admin);
SET @c_member  := (SELECT id FROM company WHERE account_id = @member);
SET @c_jihoon  := (SELECT id FROM company WHERE account_id = @jihoon);
SET @c_seoyeon := (SELECT id FROM company WHERE account_id = @seoyeon);
SET @c_minjun  := (SELECT id FROM company WHERE account_id = @minjun);
SET @c_hana    := (SELECT id FROM company WHERE account_id = @hana);
SET @c_dohyun  := (SELECT id FROM company WHERE account_id = @dohyun);
SET @c_yuna    := (SELECT id FROM company WHERE account_id = @yuna);
SET @c_woojin  := (SELECT id FROM company WHERE account_id = @woojin);
SET @c_sua     := (SELECT id FROM company WHERE account_id = @sua);
SET @c_taeyang := (SELECT id FROM company WHERE account_id = @taeyang);
SET @c_eunji   := (SELECT id FROM company WHERE account_id = @eunji);
SET @c_junseo  := (SELECT id FROM company WHERE account_id = @junseo);
SET @c_chaewon := (SELECT id FROM company WHERE account_id = @chaewon);
SET @c_hyunwoo := (SELECT id FROM company WHERE account_id = @hyunwoo);
SET @c_nayeon  := (SELECT id FROM company WHERE account_id = @nayeon);

-- 협업·파트너 설정은 15개 기업 중 11개만 채워 프로필 완성도가 섞이게 합니다.
INSERT INTO company_partner_profile (company_id, roles, interest_areas, introduction, capabilities, created_at, updated_at) VALUES
    (@c_member,  '["LEAD","PARTICIPANT"]', '["기술","사업화","창업"]', 'AI 문서 분류와 공공 데이터 활용 서비스를 만드는 12명 규모 팀입니다.', '["문서 분류 AI","공공 데이터 연계","서비스 기획","백엔드 개발"]', DATE_SUB(@now, INTERVAL 100 DAY), DATE_SUB(@now, INTERVAL 30 DAY)),
    (@c_jihoon,  '["PARTICIPANT"]', '["기술","기술개발(R&D)"]', '데이터 구축·라벨링과 품질 검수를 전문으로 합니다. 공공 데이터 구축 실적 2건.', '["데이터 구축","라벨링","품질 검수"]', DATE_SUB(@now, INTERVAL 140 DAY), DATE_SUB(@now, INTERVAL 140 DAY)),
    (@c_seoyeon, '["LEAD","PARTICIPANT"]', '["기술","사업화"]', '제조 현장 비전 검사 솔루션을 공급합니다. 스마트공장 구축 과제 주관 경험이 있습니다.', '["비전 검사","스마트공장 구축","PLC 연동"]', DATE_SUB(@now, INTERVAL 130 DAY), DATE_SUB(@now, INTERVAL 60 DAY)),
    (@c_hana,    '["LEAD"]', '["기술개발(R&D)","내수"]', '정밀 가공 부품을 설계·양산합니다. 국산화 과제 수요처와 협업을 찾고 있습니다.', '["정밀 가공","금형 설계","시제품 양산"]', DATE_SUB(@now, INTERVAL 115 DAY), DATE_SUB(@now, INTERVAL 115 DAY)),
    (@c_dohyun,  '["LEAD","PARTICIPANT"]', '["기술","사업화","글로벌"]', '요양 시설용 디지털 헬스케어 모니터링 서비스를 운영합니다.', '["헬스케어 데이터","IoT 센서","임상 협력 네트워크"]', DATE_SUB(@now, INTERVAL 100 DAY), DATE_SUB(@now, INTERVAL 15 DAY)),
    (@c_woojin,  '["PARTICIPANT"]', '["창업","인력"]', '초·중등 코딩 교육 콘텐츠와 LMS를 만듭니다.', '["교육 콘텐츠 제작","LMS 운영"]', DATE_SUB(@now, INTERVAL 80 DAY), DATE_SUB(@now, INTERVAL 80 DAY)),
    (@c_sua,     '["PARTICIPANT"]', '["기술개발(R&D)","기술"]', '식물 유래 소재 분석과 기능성 평가를 맡습니다. GLP 인증 시험 경험이 있습니다.', '["소재 분석","기능성 평가","GLP 시험"]', DATE_SUB(@now, INTERVAL 70 DAY), DATE_SUB(@now, INTERVAL 10 DAY)),
    (@c_taeyang, '["PARTICIPANT","DEMAND"]', '["내수","기술"]', '자동차 부품 2차 협력사로 생산 라인 6개를 운영합니다.', '["제조 현장 보유","생산 데이터 축적","품질 관리"]', DATE_SUB(@now, INTERVAL 70 DAY), DATE_SUB(@now, INTERVAL 70 DAY)),
    (@c_junseo,  '["PARTICIPANT"]', '["수출","판로ㆍ해외진출"]', 'HACCP 인증 전통 장류를 만들고 동남아 3개국에 수출합니다.', '["HACCP 인증","수출 실적","OEM 생산"]', DATE_SUB(@now, INTERVAL 50 DAY), DATE_SUB(@now, INTERVAL 50 DAY)),
    (@c_chaewon, '["PARTICIPANT"]', '["창업","기술"]', '초기 스타트업의 웹·앱 MVP를 빠르게 만듭니다.', '["프런트엔드 개발","UX 설계"]', DATE_SUB(@now, INTERVAL 40 DAY), DATE_SUB(@now, INTERVAL 7 DAY)),
    (@c_nayeon,  '["LEAD","PARTICIPANT"]', '["기술개발(R&D)","사업화"]', '물류 창고용 자율주행 로봇을 개발합니다. 실증 사이트를 찾고 있습니다.', '["자율주행 로봇","ROS 개발","물류 자동화"]', DATE_SUB(@now, INTERVAL 30 DAY), DATE_SUB(@now, INTERVAL 30 DAY));

INSERT INTO company_partner_profile (company_id, roles, interest_areas, introduction, capabilities, created_at, updated_at) VALUES
    (@c_admin, '["LEAD","PARTICIPANT"]', '["기술","수출","글로벌"]', '운영팀 시연용 기업입니다. 전자·소프트웨어 협업 흐름을 확인합니다.', '["전자","소프트웨어"]', DATE_SUB(@now, INTERVAL 160 DAY), DATE_SUB(@now, INTERVAL 160 DAY));

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. 파트너 모집글 6개. 모집 마감일은 오늘 이후이면서 공고 접수 마감 전날까지여야 합니다.
--    R1·R6은 개발용 회원(member)의 글이라 "내 모집글"과 받은 제안이 채워집니다. R5는 마감일이 지났고 R6은 손으로 마감했습니다.
-- ---------------------------------------------------------------------------------------------------------------------
SET @p1 := (SELECT id FROM seed_program WHERE seq = 1);
SET @p2 := (SELECT id FROM seed_program WHERE seq = 2);
SET @p3 := (SELECT id FROM seed_program WHERE seq = 3);
SET @p4 := (SELECT id FROM seed_program WHERE seq = 4);
SET @p5 := (SELECT id FROM seed_program WHERE seq = 5);
SET @p6 := (SELECT id FROM seed_program WHERE seq = 6);
SET @e1 := (SELECT application_end_date FROM seed_program WHERE seq = 1);
SET @e2 := (SELECT application_end_date FROM seed_program WHERE seq = 2);
SET @e3 := (SELECT application_end_date FROM seed_program WHERE seq = 3);
SET @e4 := (SELECT application_end_date FROM seed_program WHERE seq = 4);
SET @e6 := (SELECT application_end_date FROM seed_program WHERE seq = 6);

INSERT INTO partner_recruitment (account_id, company_id, support_program_id, title, body, own_role, seeking_role, seeking_count, region, minimum_company_age_years, capabilities, recruitment_deadline, closed_at, created_at, updated_at) VALUES
    (@member, @c_member, @p1,
     'AI 실증 과제 데이터 구축·라벨링 참여기관 구합니다',
     '문서 분류 AI 실증 과제에 함께할 데이터 구축·라벨링 참여기관을 찾습니다.\n\n우리 기업은 모델 개발과 과제 총괄을 맡고, 참여기관은 약 4만 건의 문서 이미지 라벨링과 품질 검수를 맡아 주시면 됩니다. 공공 데이터 구축 실적이 있으면 좋고, 라벨링 가이드는 저희가 제공합니다.\n\n일정은 선정 후 8개월이며 예산은 참여기관 30% 내외로 협의합니다.',
     'LEAD', 'PARTICIPANT', 1, '전국', NULL, '["데이터 구축","라벨링","품질 검수"]',
     LEAST(DATE_SUB(@e1, INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 18 DAY)), NULL, DATE_SUB(@now, INTERVAL 6 DAY), DATE_SUB(@now, INTERVAL 6 DAY)),
    (@jihoon, @c_jihoon, @p2,
     '스마트공장 고도화 과제, 제조 현장 보유 기업과 함께 하실 분',
     '생산 데이터 기반 불량 예측 과제를 주관해 주실 제조 기업을 찾습니다.\n\n저희는 데이터 파이프라인 구축과 예측 모델을 맡고, 주관기관은 실제 생산 라인과 최근 1년 이상의 공정 데이터를 제공해 주시면 됩니다. 3년 이상 업력이면 지원 요건에 맞습니다.\n\n경기 지역 기업이면 현장 방문이 수월해 우선 고려합니다.',
     'PARTICIPANT', 'LEAD', 1, '경기', 3, '["제조 현장 보유","생산 데이터 축적"]',
     LEAST(DATE_SUB(@e2, INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 24 DAY)), NULL, DATE_SUB(@now, INTERVAL 4 DAY), DATE_SUB(@now, INTERVAL 4 DAY)),
    (@hana, @c_hana, @p3,
     '정밀 가공 부품 국산화 과제, 수요처 찾습니다',
     '수입에 의존하던 고정밀 감속기 부품을 국산화하는 과제입니다.\n\n시제품을 시험 평가하고 양산 후 구매 의향을 확인해 줄 수요처 2곳을 찾습니다. 부품 사양과 평가 항목은 협의로 정하고, 시험 비용은 과제 예산에서 부담합니다.\n\n업력 5년 이상, 관련 부품 구매 계획이 있는 기업이면 좋겠습니다.',
     'LEAD', 'DEMAND', 2, '전국', 5, '["부품 구매 계획","시험 평가 협조"]',
     LEAST(DATE_SUB(@e3, INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 14 DAY)), NULL, DATE_SUB(@now, INTERVAL 9 DAY), DATE_SUB(@now, INTERVAL 9 DAY)),
    (@dohyun, @c_dohyun, @p4,
     '디지털 헬스케어 실증, 병원·요양 시설 운영 기관과 함께합니다',
     '요양 시설 입소자 대상 낙상·활력 징후 모니터링 서비스를 실증할 참여기관을 찾습니다.\n\n참여기관은 시설 현장과 보호자 동의 절차를 맡고, 저희는 센서 설치·데이터 분석·운영을 맡습니다. 대전·충청권 시설을 우선하되 다른 지역도 협의 가능합니다.\n\n실증 기간은 6개월이고 시설당 장비 20대를 무상 제공합니다.',
     'LEAD', 'PARTICIPANT', 2, '대전', NULL, '["의료 데이터 보유","임상 현장"]',
     LEAST(DATE_SUB(@e4, INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 21 DAY)), NULL, DATE_SUB(@now, INTERVAL 12 DAY), DATE_SUB(@now, INTERVAL 12 DAY)),
    (@yuna, @c_yuna, @p5,
     '콜드체인 물류 공동 과제, 수출 식품 기업 구합니다',
     '신선 식품 수출 콜드체인 실증 과제를 주관해 주실 식품 제조·수출 기업을 찾습니다.\n\n저희는 인천항 기준 냉장 보관과 해상 운송 구간 온도 추적을 맡습니다. 주관기관은 수출 물량과 HACCP 인증을 갖추고 계셔야 합니다.\n\n마감이 지났지만 문의는 받고 있습니다.',
     'PARTICIPANT', 'LEAD', 1, '인천', NULL, '["수출 실적","HACCP 인증"]',
     DATE_SUB(CURDATE(), INTERVAL 3 DAY), NULL, DATE_SUB(@now, INTERVAL 30 DAY), DATE_SUB(@now, INTERVAL 30 DAY)),
    (@member, @c_member, @p6,
     '공공 데이터 활용 서비스 개발, 기획 파트너 찾습니다',
     '공공 데이터를 활용한 소상공인 상권 분석 서비스 과제입니다.\n\n서비스 기획과 UX 설계를 맡아 줄 참여기관을 찾습니다. 개발과 데이터 처리는 저희가 맡고, 참여기관은 사용자 조사와 화면 설계를 맡아 주시면 됩니다.\n\n서울 지역 기업을 우선합니다.',
     'LEAD', 'PARTICIPANT', 1, '서울', NULL, '["서비스 기획","UX 설계"]',
     LEAST(DATE_SUB(@e6, INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 10 DAY)), DATE_SUB(@now, INTERVAL 2 DAY), DATE_SUB(@now, INTERVAL 20 DAY), DATE_SUB(@now, INTERVAL 2 DAY));

SET @r1 := (SELECT id FROM partner_recruitment WHERE account_id = @member AND support_program_id = @p1);
SET @r2 := (SELECT id FROM partner_recruitment WHERE account_id = @jihoon AND support_program_id = @p2);
SET @r3 := (SELECT id FROM partner_recruitment WHERE account_id = @hana AND support_program_id = @p3);
SET @r4 := (SELECT id FROM partner_recruitment WHERE account_id = @dohyun AND support_program_id = @p4);
SET @r6 := (SELECT id FROM partner_recruitment WHERE account_id = @member AND support_program_id = @p6);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. 제안 10개. 상태는 응답 기한(7일)과 모집 상태로 계산되므로 만료는 오래된 대기 제안(P7)과 마감된 글의 대기 제안(P9)으로 만듭니다.
--    member는 받은 제안 3건(R1)과 보낸 제안 2건(R2 대기, R3 거절)을 갖습니다.
-- ---------------------------------------------------------------------------------------------------------------------
INSERT INTO partner_proposal (recruitment_id, proposer_account_id, proposer_company_id, message, share_profile, decision, responded_at, withdrawn_at, created_at, updated_at) VALUES
    (@r1, @sua, @c_sua, '라벨링 운영과 품질 검수를 맡겠습니다. 공공 데이터 구축 과제에서 검수 정확도 99%를 유지한 실적이 있고, 검수 인력 6명을 바로 투입할 수 있습니다.', TRUE, NULL, NULL, NULL, DATE_SUB(@now, INTERVAL 2 DAY), DATE_SUB(@now, INTERVAL 2 DAY)),
    (@r1, @taeyang, @c_taeyang, '제조 문서 라벨링 경험은 없지만 사내 품질 관리팀이 문서 검수를 할 수 있습니다. 조건을 협의하고 싶습니다.', FALSE, NULL, NULL, NULL, DATE_SUB(@now, INTERVAL 1 DAY), DATE_SUB(@now, INTERVAL 1 DAY)),
    (@r1, @junseo, @c_junseo, '식품 라벨·성분표 문서 4천 건을 보유하고 있어 라벨링 데이터로 제공할 수 있습니다. 검수는 외부 인력과 함께 진행하겠습니다.', TRUE, 'ACCEPTED', DATE_SUB(@now, INTERVAL 4 DAY), NULL, DATE_SUB(@now, INTERVAL 5 DAY), DATE_SUB(@now, INTERVAL 4 DAY)),
    (@r2, @member, @c_member, '주관은 어렵지만 데이터 파이프라인 구축을 나눠 맡을 수 있습니다. 경기 지역 협력사 한 곳을 주관기관으로 소개할 수 있으니 한번 이야기 나누고 싶습니다.', TRUE, NULL, NULL, NULL, DATE_SUB(@now, INTERVAL 3 DAY), DATE_SUB(@now, INTERVAL 3 DAY)),
    (@r3, @member, @c_member, '감속기 부품을 쓰는 로봇 개발사와 연결해 드릴 수 있습니다. 저희가 직접 구매하는 기업은 아니라 수요처 자격이 되는지 확인 부탁드립니다.', FALSE, 'DECLINED', DATE_SUB(@now, INTERVAL 7 DAY), NULL, DATE_SUB(@now, INTERVAL 8 DAY), DATE_SUB(@now, INTERVAL 7 DAY)),
    (@r3, @nayeon, @c_nayeon, '물류 로봇 구동부에 감속기 부품을 연 1,200개 이상 씁니다. 시제품 시험 평가와 양산 후 구매 의향서를 낼 수 있습니다.', TRUE, NULL, NULL, NULL, DATE_SUB(@now, INTERVAL 1 DAY), DATE_SUB(@now, INTERVAL 1 DAY)),
    (@r4, @eunji, @c_eunji, '전남 지역 요양 시설 2곳과 협약이 있어 실증 현장을 제공할 수 있습니다. 지역이 달라도 가능한지 문의드립니다.', TRUE, NULL, NULL, NULL, DATE_SUB(@now, INTERVAL 10 DAY), DATE_SUB(@now, INTERVAL 10 DAY)),
    (@r4, @hyunwoo, @c_hyunwoo, '보호자용 앱 화면 설계와 사용성 평가를 맡을 수 있습니다.', FALSE, NULL, NULL, DATE_SUB(@now, INTERVAL 5 DAY), DATE_SUB(@now, INTERVAL 6 DAY), DATE_SUB(@now, INTERVAL 5 DAY)),
    (@r6, @seoyeon, @c_seoyeon, '상권 분석 대시보드 기획 경험이 있습니다. 사용자 조사부터 화면 설계까지 맡겠습니다.', TRUE, NULL, NULL, NULL, DATE_SUB(@now, INTERVAL 4 DAY), DATE_SUB(@now, INTERVAL 4 DAY)),
    (@r6, @woojin, @c_woojin, '교육 서비스 기획팀이 소상공인 대상 사용자 조사를 진행할 수 있습니다. 세종·충청권 소상공인 네트워크가 있습니다.', TRUE, 'ACCEPTED', DATE_SUB(@now, INTERVAL 11 DAY), NULL, DATE_SUB(@now, INTERVAL 12 DAY), DATE_SUB(@now, INTERVAL 11 DAY));

-- 관리자 계정이 보낸 대기 제안 1건(R3). 관리자 세션에서 "보낸 제안"이 비어 있지 않게 합니다.
INSERT INTO partner_proposal (recruitment_id, proposer_account_id, proposer_company_id, message, share_profile, decision, responded_at, withdrawn_at, created_at, updated_at) VALUES
    (@r3, @admin, @c_admin, '시제품 시험 평가에 참여하고 싶습니다. 메일로 연락 부탁드립니다.', TRUE, NULL, NULL, NULL, DATE_SUB(@now, INTERVAL 1 DAY), DATE_SUB(@now, INTERVAL 1 DAY));

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. 관리자 조치 기록 2건(강제 로그아웃). 정지·삭제 계정은 두지 않습니다.
-- ---------------------------------------------------------------------------------------------------------------------
INSERT INTO account_admin_action (target_account_id, admin_account_id, action, reason, created_at) VALUES
    (@minjun,  @admin, 'SESSIONS_REVOKE', '비밀번호 유출 의심 신고가 접수되어 모든 기기의 세션을 정리했습니다.', DATE_SUB(@now, INTERVAL 15 DAY)),
    (@hyunwoo, @admin, 'SESSIONS_REVOKE', '이용자 요청으로 분실한 기기의 세션을 종료했습니다.', DATE_SUB(@now, INTERVAL 3 DAY));

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. 관심 공고 5건. 개발용 회원(member)이 모집글에 쓰인 공고 5건을 담아 두어 관심 공고함 달력·목록·진행 관리와 도우미 마감 답이 채워집니다.
-- ---------------------------------------------------------------------------------------------------------------------
INSERT INTO saved_support_program (account_id, support_program_id, saved_at) VALUES
    (@member, @p1, DATE_SUB(@now, INTERVAL 1 DAY)),
    (@member, @p2, DATE_SUB(@now, INTERVAL 2 DAY)),
    (@member, @p3, DATE_SUB(@now, INTERVAL 2 DAY)),
    (@member, @p4, DATE_SUB(@now, INTERVAL 3 DAY)),
    (@member, @p5, DATE_SUB(@now, INTERVAL 5 DAY));

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. 중복 지원·수혜 검토 2건. 첫 검토는 저장된 자동 분석 결과와 내려받을 수 있는 데모 원문까지 갖고,
--    두 번째 검토는 사용자가 입력을 고치고 실제 분석을 새로 실행할 수 있는 초안입니다.
-- ---------------------------------------------------------------------------------------------------------------------
SET @p1_source_code := (SELECT source_code FROM support_program WHERE id = @p1);
SET @p1_source_program_id := (SELECT source_program_id FROM support_program WHERE id = @p1);
SET @p1_source_url := (SELECT source_url FROM support_program WHERE id = @p1);
SET @p2_source_code := (SELECT source_code FROM support_program WHERE id = @p2);
SET @p2_source_program_id := (SELECT source_program_id FROM support_program WHERE id = @p2);
SET @p2_source_url := (SELECT source_url FROM support_program WHERE id = @p2);
SET @p3_source_code := (SELECT source_code FROM support_program WHERE id = @p3);
SET @p3_source_program_id := (SELECT source_program_id FROM support_program WHERE id = @p3);
SET @p4_source_code := (SELECT source_code FROM support_program WHERE id = @p4);
SET @p4_source_program_id := (SELECT source_program_id FROM support_program WHERE id = @p4);

INSERT INTO combination_review (owner_account_id, title, input_revision, created_at, updated_at)
VALUES (@member, '진행 중인 지원사업과 신규 신청 중복 검토', 1, DATE_SUB(@now, INTERVAL 5 DAY), DATE_SUB(@now, INTERVAL 4 DAY));
SET @review_completed := LAST_INSERT_ID();

INSERT INTO combination_review_program (
    review_id, position, source_code, source_program_id, sub_program_id,
    application_submitted, selected, commitment_submitted, agreement_signed, execution_status, funding_received
) VALUES
    (@review_completed, 0, @p1_source_code, @p1_source_program_id, NULL, 'YES', 'YES', 'YES', 'YES', 'IN_PROGRESS', 'YES'),
    (@review_completed, 1, @p2_source_code, @p2_source_program_id, NULL, 'YES', 'NO', 'NO', 'NO', 'NOT_STARTED', 'NO');

SET @review_facts := '기존 사업은 협약을 체결해 수행 중이며, 신규 사업은 신청서 제출 전 중복 수혜 가능성을 확인하려는 단계입니다.';
SET @review_source_0 := CONVERT('데모 원문 1\n동일 또는 유사한 사업 내용으로 다른 정부지원사업의 보조금을 중복하여 지원받을 수 없습니다. 수행 중인 협약과 신규 신청 과제의 목적, 비용 항목 및 수행 기간이 겹치는지 확인해야 합니다.' USING utf8mb4);
SET @review_source_1 := CONVERT('데모 원문 2\n신규 신청기업은 타 지원사업 수행 여부를 신청서에 기재해야 합니다. 사업 목적과 지원 항목이 다르면 신청할 수 있으나, 최종 인정 여부는 전담기관의 검토 결과에 따릅니다.' USING utf8mb4);
SET @review_source_0_hash := SHA2(@review_source_0, 256);
SET @review_source_1_hash := SHA2(@review_source_1, 256);
SET @review_started_at := DATE_SUB(@now, INTERVAL 4 DAY);
SET @review_finished_at := DATE_ADD(@review_started_at, INTERVAL 2 MINUTE);

INSERT INTO combination_review_run (
    review_id, input_revision, request_key, request_hash, status, input_json, evidence_json, configuration_json,
    analysis_json, failure_code, runner_instance_id, started_at, finished_at, execution_started_at
) VALUES (
    @review_completed,
    1,
    '10000000-0000-4000-8000-000000000001',
    SHA2(CONCAT('1\n', @review_facts), 256),
    'SUCCEEDED',
    JSON_OBJECT(
        'title', '진행 중인 지원사업과 신규 신청 중복 검토',
        'programs', JSON_ARRAY(
            JSON_OBJECT(
                'identity', JSON_OBJECT('sourceCode', @p1_source_code, 'sourceProgramId', @p1_source_program_id, 'subProgramId', NULL),
                'participation', JSON_OBJECT('applicationSubmitted', 'YES', 'selected', 'YES', 'commitmentSubmitted', 'YES', 'agreementSigned', 'YES', 'executionStatus', 'IN_PROGRESS', 'fundingReceived', 'YES')
            ),
            JSON_OBJECT(
                'identity', JSON_OBJECT('sourceCode', @p2_source_code, 'sourceProgramId', @p2_source_program_id, 'subProgramId', NULL),
                'participation', JSON_OBJECT('applicationSubmitted', 'YES', 'selected', 'NO', 'commitmentSubmitted', 'NO', 'agreementSigned', 'NO', 'executionStatus', 'NOT_STARTED', 'fundingReceived', 'NO')
            )
        ),
        'additionalFacts', @review_facts,
        'asOfDate', DATE_FORMAT(CURDATE(), '%Y-%m-%d')
    ),
    JSON_OBJECT(
        'documents', JSON_ARRAY(
            JSON_OBJECT('programIndex', 0, 'sourceUrl', @p1_source_url, 'sourcePageUrl', @p1_source_url, 'fileName', '기존사업-데모원문.txt', 'format', 'TXT', 'rawHash', @review_source_0_hash, 'textHash', @review_source_0_hash, 'parserVersion', 'demo-seed-v1', 'fetchedAt', DATE_FORMAT(@review_started_at, '%Y-%m-%dT%H:%i:%s.%f')),
            JSON_OBJECT('programIndex', 1, 'sourceUrl', @p2_source_url, 'sourcePageUrl', @p2_source_url, 'fileName', '신규사업-데모원문.txt', 'format', 'TXT', 'rawHash', @review_source_1_hash, 'textHash', @review_source_1_hash, 'parserVersion', 'demo-seed-v1', 'fetchedAt', DATE_FORMAT(@review_started_at, '%Y-%m-%dT%H:%i:%s.%f'))
        ),
        'blocks', JSON_ARRAY(
            JSON_OBJECT('id', 'demo-evidence-1', 'programIndex', 0, 'documentHash', @review_source_0_hash, 'locator', '데모 원문 1, 문단 1', 'text', '동일 또는 유사한 사업 내용으로 다른 정부지원사업의 보조금을 중복하여 지원받을 수 없습니다.'),
            JSON_OBJECT('id', 'demo-evidence-2', 'programIndex', 1, 'documentHash', @review_source_1_hash, 'locator', '데모 원문 2, 문단 1', 'text', '사업 목적과 지원 항목이 다르면 신청할 수 있으나, 최종 인정 여부는 전담기관의 검토 결과에 따릅니다.')
        ),
        'coverageWarnings', JSON_ARRAY('이 결과는 화면 확인용 데모 원문을 사용했으며 실제 공고 원문 판정이 아닙니다.')
    ),
    JSON_OBJECT('contractVersion', 'combination-review-v1', 'model', 'demo-seed-no-paid-call', 'promptVersion', 'demo-seed-v1'),
    JSON_OBJECT(
        'summary', '두 사업의 목적과 비용 항목이 겹치면 중복 수혜 제한이 적용될 수 있어 전담기관 확인이 필요합니다.',
        'pairs', JSON_ARRAY(
            JSON_OBJECT(
                'firstProgramIndex', 0,
                'secondProgramIndex', 1,
                'stages', JSON_ARRAY(
                    JSON_OBJECT('stage', 'APPLICATION', 'judgment', 'NEEDS_FACTS', 'scope', '신규 사업 신청 단계', 'explanation', '신청 자체는 가능할 수 있으나 두 과제의 목적과 비용 항목 구분 자료가 더 필요합니다.', 'questions', JSON_ARRAY('두 사업의 세부 비용 항목이 겹치나요?', '신규 과제 산출물이 기존 협약 산출물과 구분되나요?'), 'requiresInstitutionConfirmation', TRUE, 'citations', JSON_ARRAY(JSON_OBJECT('evidenceId', 'demo-evidence-2', 'quote', '사업 목적과 지원 항목이 다르면 신청할 수 있으나'))),
                    JSON_OBJECT('stage', 'SELECTION', 'judgment', 'INSUFFICIENT_EVIDENCE', 'scope', '신규 사업 선정 단계', 'explanation', '선정 단계의 중복 참여 처리 기준은 데모 원문만으로 확인할 수 없습니다.', 'questions', JSON_ARRAY('선정 통보 전에 기존 수행 사업을 신고해야 하나요?'), 'requiresInstitutionConfirmation', TRUE, 'citations', JSON_ARRAY()),
                    JSON_OBJECT('stage', 'COMMITMENT', 'judgment', 'NEEDS_FACTS', 'scope', '확약서 제출 단계', 'explanation', '두 과제의 산출물과 인력 투입 계획을 구분한 자료가 필요합니다.', 'questions', JSON_ARRAY('동일한 인력이 같은 기간에 두 과제에 투입되나요?'), 'requiresInstitutionConfirmation', TRUE, 'citations', JSON_ARRAY()),
                    JSON_OBJECT('stage', 'AGREEMENT', 'judgment', 'CONFLICTING_EVIDENCE', 'scope', '신규 협약 체결 단계', 'explanation', '사업 목적이 다르면 가능하다는 내용과 유사 사업의 중복 지원을 제한하는 내용이 함께 있어 기관 확인이 필요합니다.', 'questions', JSON_ARRAY('전담기관이 두 과제의 목적과 비용 구분을 인정했나요?'), 'requiresInstitutionConfirmation', TRUE, 'citations', JSON_ARRAY(JSON_OBJECT('evidenceId', 'demo-evidence-1', 'quote', '동일 또는 유사한 사업 내용'), JSON_OBJECT('evidenceId', 'demo-evidence-2', 'quote', '사업 목적과 지원 항목이 다르면 신청할 수 있으나'))),
                    JSON_OBJECT('stage', 'EXECUTION', 'judgment', 'NEEDS_FACTS', 'scope', '두 사업 동시 수행 단계', 'explanation', '수행 기간과 참여 인력, 산출물이 실제로 분리되는지 확인해야 합니다.', 'questions', JSON_ARRAY('수행 일정과 참여 인력을 사업별로 구분했나요?'), 'requiresInstitutionConfirmation', TRUE, 'citations', JSON_ARRAY()),
                    JSON_OBJECT('stage', 'FUNDING', 'judgment', 'RESTRICTION_APPLIES', 'scope', '동일 비용의 중복 수혜', 'explanation', '동일하거나 유사한 사업 내용과 비용에 보조금을 중복 적용하면 제한됩니다.', 'questions', JSON_ARRAY(), 'requiresInstitutionConfirmation', FALSE, 'citations', JSON_ARRAY(JSON_OBJECT('evidenceId', 'demo-evidence-1', 'quote', '다른 정부지원사업의 보조금을 중복하여 지원받을 수 없습니다')))
                )
            )
        ),
        'limitations', JSON_ARRAY('자동 생성된 데모 결과이며 실제 자격 판정이나 기관 답변을 대신하지 않습니다.', '화면 동작 확인을 위해 축약한 가상 원문을 사용했습니다.')
    ),
    NULL,
    '20000000-0000-4000-8000-000000000001',
    @review_started_at,
    @review_finished_at,
    @review_started_at
);
SET @review_run_completed := LAST_INSERT_ID();

INSERT INTO combination_review_run_source (run_id, document_index, raw_hash, raw_bytes) VALUES
    (@review_run_completed, 0, @review_source_0_hash, @review_source_0),
    (@review_run_completed, 1, @review_source_1_hash, @review_source_1);

INSERT INTO combination_review (owner_account_id, title, input_revision, created_at, updated_at)
VALUES (@member, '마케팅·기술지원 사업 동시 신청 검토', 1, DATE_SUB(@now, INTERVAL 1 DAY), DATE_SUB(@now, INTERVAL 1 DAY));
SET @review_draft := LAST_INSERT_ID();

INSERT INTO combination_review_program (
    review_id, position, source_code, source_program_id, sub_program_id,
    application_submitted, selected, commitment_submitted, agreement_signed, execution_status, funding_received
) VALUES
    (@review_draft, 0, @p3_source_code, @p3_source_program_id, NULL, 'YES', 'UNKNOWN', 'NO', 'NO', 'NOT_STARTED', 'NO'),
    (@review_draft, 1, @p4_source_code, @p4_source_program_id, NULL, 'NO', 'NO', 'NO', 'NO', 'NOT_STARTED', 'NO');

-- ---------------------------------------------------------------------------------------------------------------------
-- 신청 준비는 실행 스크립트가 application-preparations.sql로 이어서 적재합니다.

DROP TEMPORARY TABLE IF EXISTS seed_program;

SELECT
    (SELECT COUNT(*) FROM account WHERE deleted_at IS NULL) AS accounts,
    (SELECT COUNT(*) FROM company) AS companies,
    (SELECT COUNT(*) FROM partner_recruitment) AS recruitments,
    (SELECT COUNT(*) FROM partner_proposal) AS proposals,
    (SELECT COUNT(*) FROM account_oauth_identity) AS oauth_links,
    (SELECT COUNT(*) FROM account_admin_action) AS admin_actions,
    (SELECT COUNT(*) FROM saved_support_program) AS saved_programs,
    (SELECT COUNT(*) FROM combination_review) AS combination_reviews,
    (SELECT COUNT(*) FROM combination_review_run) AS combination_review_runs,
    (SELECT COUNT(*) FROM application_preparation) AS application_preparations,
    (SELECT COUNT(*) FROM application_preparation_content) AS application_contents;
