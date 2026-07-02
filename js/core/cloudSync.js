/**
 * 파일명: cloudSync.js
 * 역할: Supabase 기반 온라인(클라우드) 백업 — Google 로그인(선택 사항), 백업 업로드/다운로드 담당 모듈.
 * - 로그인은 어디까지나 "선택 사항"이며, 로그인하지 않아도 로컬 저장(services.js)만으로 앱의 모든 기능이
 *   기존과 완전히 동일하게 동작한다(로컬 우선 원칙). 로그인 시에만 온라인 백업/복원 버튼이 활성화된다.
 * - 로컬 JSON 백업과 완전히 동일한 payload 구조(services.js의 buildBackupPayload/applyBackupPayload)를
 *   그대로 재사용해 로컬 백업과 클라우드 백업이 항상 같은 데이터 형태를 유지한다.
 * - Supabase 클라이언트는 index.html/calendar.html에서 먼저 로드하는 CDN 스크립트
 *   (https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2)가 전역 window.supabase 로 노출하는
 *   createClient()를 그대로 사용한다(번들러 불필요 — 기존 Tailwind/Chart.js/Sortable과 동일한 CDN 방식).
 * - 안드로이드 앱(Capacitor) 버전과 달리 순수 웹 환경이므로 OAuth 로그인은 커스텀 스킴 딥링크가 아닌
 *   표준 브라우저 리디렉션 방식을 사용한다: signInWithOAuth() 호출 시 현재 탭이 Google로 이동했다가
 *   로그인 후 그대로 이 페이지(redirectTo)로 되돌아오며, supabase-js가 URL의 토큰을 자동 감지해
 *   세션을 완성한다(detectSessionInUrl 기본값 true) — 별도의 딥링크 처리 코드가 필요 없다.
 */
import { buildBackupPayload, applyBackupPayload, saveToLocal, migrateData } from './services.js';
import { applyCustomSuppsToDB } from './store.js';

const SUPABASE_URL = 'https://osyhwxowsrgvshyrdupc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_k6pehMLdl_XaT26SoBUPVg_x-WAYbuP';
const BACKUPS_TABLE = 'backups';

let supabaseClient = null;

function getClient() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase 스크립트가 아직 로드되지 않았습니다.');
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    return supabaseClient;
}

export async function getCurrentUser() {
    try {
        const { data } = await getClient().auth.getUser();
        return data?.user || null;
    } catch (e) {
        return null;
    }
}

/**
 * 세션 변경(로그인/로그아웃/토큰 갱신) 시마다 콜백을 호출한다. 부팅 시 1회만 등록해야 한다.
 */
export function onAuthStateChange(callback) {
    getClient().auth.onAuthStateChange((event, session) => {
        callback(session?.user || null, event);
    });
}

/**
 * Google OAuth 로그인 시작. 현재 탭을 Google 로그인 화면으로 이동시키고, 완료 후 이 페이지(redirectTo)로
 * 되돌아온다. 페이지가 index.html이면 index.html로, calendar.html이면 calendar.html로 각각 복귀한다.
 */
export async function signInWithGoogle() {
    const { error } = await getClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
}

export async function signOut() {
    await getClient().auth.signOut();
}

/**
 * 현재 전체 상태를 Supabase backups 테이블에 업서트한다(로그인 사용자 1명당 1행, RLS로 본인 행만 접근 가능).
 * 안드로이드 앱과 완전히 동일한 테이블/스키마를 공유하므로, 같은 Google 계정이면 PC 웹과 폰 앱이 같은
 * 백업을 주고받을 수 있다.
 */
export async function uploadBackupToCloud(showToastCallback) {
    const user = await getCurrentUser();
    if (!user) { if (showToastCallback) showToastCallback('먼저 Google 계정으로 로그인해 주세요.'); return; }
    const { error } = await getClient().from(BACKUPS_TABLE).upsert({
        user_id: user.id,
        payload: buildBackupPayload(),
        updated_at: new Date().toISOString(),
    });
    if (error) {
        console.error('온라인 백업 실패:', error);
        if (showToastCallback) showToastCallback('온라인 백업 실패: ' + error.message);
        return;
    }
    try { localStorage.setItem('pmp_last_cloud_sync', new Date().toISOString()); } catch (e) { /* ignore */ }
    if (showToastCallback) showToastCallback('☁️ 온라인(Supabase) 백업 완료.');
}

/**
 * Supabase backups 테이블에서 payload를 내려받아 로컬 state 에 반영한다(로컬 JSON 복원과 동일 경로 재사용).
 */
export async function downloadBackupFromCloud(onSuccess, onError, showToastCallback) {
    const user = await getCurrentUser();
    if (!user) { if (showToastCallback) showToastCallback('먼저 Google 계정으로 로그인해 주세요.'); return; }
    const { data, error } = await getClient().from(BACKUPS_TABLE).select('payload, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) { console.error('온라인 복원 조회 실패:', error); if (onError) onError(error); return; }
    if (!data) { if (showToastCallback) showToastCallback('온라인에 저장된 백업이 아직 없습니다.'); return; }
    try {
        const parsed = migrateData(data.payload);
        applyBackupPayload(parsed);
        applyCustomSuppsToDB();
        saveToLocal();
        try { localStorage.setItem('pmp_last_cloud_sync', new Date().toISOString()); } catch (e) { /* ignore */ }
        if (onSuccess) onSuccess();
    } catch (e) {
        if (onError) onError(e);
    }
}

function getLastCloudSyncDisplay() {
    try {
        const iso = localStorage.getItem('pmp_last_cloud_sync');
        if (!iso) return '아직 없음';
        const d = new Date(iso);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
        return '아직 없음';
    }
}

/**
 * 환경설정 탭의 로그인 상태 배지/버튼/마지막 동기화 시각을 현재 세션 기준으로 갱신한다.
 * index.html·calendar.html 양쪽 설정 탭이 동일한 id(cloud-auth-status 등)를 사용하므로 공용으로 재사용된다.
 */
export function renderCloudAuthUI() {
    const statusEl = document.getElementById('cloud-auth-status');
    if (!statusEl) return;
    const loginBtn = document.getElementById('btn-cloud-login');
    const logoutBtn = document.getElementById('btn-cloud-logout');
    const actionsEl = document.getElementById('cloud-backup-actions');
    const syncEl = document.getElementById('cloud-last-sync');

    getCurrentUser().then(user => {
        if (user) {
            statusEl.innerText = `✅ 로그인됨: ${user.email || user.id}`;
            if (loginBtn) loginBtn.classList.add('hidden');
            if (logoutBtn) logoutBtn.classList.remove('hidden');
            if (actionsEl) actionsEl.classList.remove('opacity-40', 'pointer-events-none');
        } else {
            statusEl.innerText = '로그인되지 않음 (로컬 전용 모드로 정상 동작)';
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (logoutBtn) logoutBtn.classList.add('hidden');
            if (actionsEl) actionsEl.classList.add('opacity-40', 'pointer-events-none');
        }
        if (syncEl) syncEl.innerText = `마지막 동기화: ${getLastCloudSyncDisplay()}`;
    });
}
