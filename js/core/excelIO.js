/**
 * 파일명: excelIO.js
 * 역할: '엑셀 내보내기/불러오기' 공용 유틸리티 — ExcelJS(vendor/exceljs.min.js, 전역 window.ExcelJS)를 감싸,
 * 진짜 .xlsx 파일 생성(데이터 유효성 검사=드롭다운 목록 포함) + 저장 + 파일 선택 후 읽기를 표준화한다.
 * 식단 플래너(dietPlanner.js)와 운동 일지(workoutJournal.js) 양쪽의 엑셀 기능이 이 모듈만 재사용한다.
 *
 * [드롭다운 목록 설계] Excel의 데이터 유효성 검사(목록)는 셀 범위를 소스로 참조할 수 있는데, 값 목록이
 * 길면(255자 초과) 인라인 콤마 목록을 못 쓰므로 숨김 시트("목록")에 값을 세로로 나열해두고 그 범위를
 * 참조하는 방식을 쓴다. errorStyle을 'warning'으로 둬 목록에 없는 값을 적어도 강제로 막지는 않는다 —
 * 사용자가 커스텀 보충제처럼 DB에 아직 없는 값을 입력할 여지를 남겨두기 위함이다.
 */

import { saveBinaryFileNative } from './services.js';

export function ensureExcelLib() {
    if (typeof window.ExcelJS === 'undefined') throw new Error('엑셀 라이브러리를 불러오지 못했습니다.');
    return window.ExcelJS;
}

/**
 * 드롭다운 값 목록을 담을 숨김 시트를 만든다. 한 워크북에 여러 데이터 시트(예: 운동일지 + 루틴 프리셋)를
 * 같이 담을 때 목록 시트 이름이 겹치지 않도록 sheetName을 다르게 지정할 수 있다.
 * @param {import('exceljs').Workbook} workbook
 * @param {Array<{header: string, values: string[]}>} columns
 * @param {string} [sheetName='목록']
 * @returns {import('exceljs').Worksheet}
 */
export function buildHiddenListSheet(workbook, columns, sheetName = '목록') {
    const sheet = workbook.addWorksheet(sheetName);
    columns.forEach((col, i) => {
        const colLetter = numToColLetter(i + 1);
        sheet.getCell(`${colLetter}1`).value = col.header;
        col.values.forEach((v, idx) => { sheet.getCell(`${colLetter}${idx + 2}`).value = v; });
    });
    sheet.state = 'hidden';
    return sheet;
}

function numToColLetter(n) {
    let s = '';
    while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
    return s;
}

/**
 * 데이터 시트의 한 컬럼(colLetter) 전체 행 범위(rowStart~rowEnd)에 목록형 데이터 유효성 검사를 건다.
 * @param {import('exceljs').Worksheet} worksheet
 * @param {string} colLetter
 * @param {number} rowStart
 * @param {number} rowEnd
 * @param {string} formula - 예: "목록!$A$2:$A$50" 또는 인라인 목록 "\"O,X\""
 */
export function applyListValidation(worksheet, colLetter, rowStart, rowEnd, formula) {
    for (let r = rowStart; r <= rowEnd; r++) {
        worksheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [formula],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: '목록에 없는 값',
            error: '목록에 없는 값입니다. 그래도 이 값을 사용하려면 "예"를 누르세요.',
        };
    }
}

/** 헤더 행에 굵게+배경색 스타일을 입혀 데이터 시트를 보기 좋게 만든다. */
export function styleHeaderRow(worksheet, rowNum = 1) {
    const row = worksheet.getRow(rowNum);
    row.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFF8FAFC' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    row.height = 20;
}

/** 워크북을 파일명.xlsx로 저장(저장 다이얼로그 또는 다운로드). */
export async function saveWorkbookAsFile(workbook, fileName, showToastCallback) {
    const buffer = await workbook.xlsx.writeBuffer();
    await saveBinaryFileNative(fileName, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', showToastCallback);
}

/**
 * <input type="file"> change 이벤트에서 선택된 .xlsx 파일을 읽어 ExcelJS Workbook으로 반환한다.
 * @returns {Promise<import('exceljs').Workbook|null>}
 */
export function readWorkbookFromEvent(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return Promise.resolve(null);
    const ExcelJS = ensureExcelLib();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(e.target.result);
                resolve(workbook);
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

/** 워크시트의 특정 행(row)에서 셀 값을 문자열로 안전하게 꺼낸다(숫자/날짜/수식 결과 모두 텍스트화). */
export function cellText(row, colIdx) {
    const cell = row.getCell(colIdx);
    if (cell === undefined || cell === null) return '';
    let v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        else if (Array.isArray(v.richText)) v = v.richText.map(r => r.text).join(''); // 리치텍스트(부분 서식) 셀
        else if (v.text !== undefined) v = v.text; // 하이퍼링크
        else if (v.result !== undefined) v = v.result; // 수식 셀
    }
    return String(v).trim();
}

/** 워크시트의 특정 행에서 셀 값을 숫자로 안전하게 꺼낸다. */
export function cellNumber(row, colIdx) {
    const t = cellText(row, colIdx);
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
}
