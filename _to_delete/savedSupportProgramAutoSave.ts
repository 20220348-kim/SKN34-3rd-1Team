/**
 * 진행 관리 파이프라인에서 연 공고를 딱 한 번만 자동으로 관심 공고함에 담기 위한 표시입니다.
 *
 * 한 번 담은 뒤 사용자가 직접 빼면 그 선택을 그대로 존중해야 하는데, 이 판단은 화면을 다시 열어도
 * 유지돼야 하므로 컴포넌트 상태가 아니라 브라우저에 공고별로 기록해 둡니다. 표시가 있는데 관심 공고함에
 * 없다면 사용자가 직접 뺀 것이므로, 목록·달력과 마찬가지로 진행 관리에서도 감춥니다.
 */
type AutoSaveIdentity = { sourceCode: string; sourceProgramId: string }

const storagePrefix = 'govbiz:autoSavedSupportProgram'

function storageKey(accountEmail: string | null, identity: AutoSaveIdentity): string {
  return `${storagePrefix}:${accountEmail ?? 'anon'}:${identity.sourceCode}:${identity.sourceProgramId}`
}

/** 이 공고에 자동 담기를 이미 한 번 했는지입니다. 브라우저 저장소를 못 쓰면 하지 않은 것으로 봅니다. */
export function wasSupportProgramAutoSaved(accountEmail: string | null, identity: AutoSaveIdentity): boolean {
  try {
    return localStorage.getItem(storageKey(accountEmail, identity)) === '1'
  } catch {
    return false
  }
}

/** 자동 담기를 한 번 했다고 기록합니다. 기록에 실패해도 담기 자체는 그대로 진행합니다. */
export function markSupportProgramAutoSaved(accountEmail: string | null, identity: AutoSaveIdentity): void {
  try {
    localStorage.setItem(storageKey(accountEmail, identity), '1')
  } catch {
    // 브라우저 저장소를 못 쓰면 이번 방문에서만 한 번으로 제한됩니다.
  }
}
