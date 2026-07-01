/**
 * 파일명: restTimerEngine.js
 * 역할: 휴식 타이머 카운트다운 및 Web Audio API 기반 알람음 신디사이징 엔진
 * 종목별 휴식 타이머(workoutJournal.js)와 수동 알람(calendarSettings.js) 양쪽에서 공유하는 하위 엔진이며,
 * 특정 종목/일지 데이터에는 의존하지 않는다(초 단위 시간과 알람음 종류만 파라미터로 받는다).
 */

import { state } from '../core/store.js';

let restTimerInterval = null;
let alarmAudioInterval = null;
let currentTimerSeconds = 0;
let currentAlarmSound = '1';

function playAudioTone(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        if (type === '2') {
            const notes = [659.25, 880, 1046.50];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i*0.15); gain.gain.linearRampToValueAtTime(0.4, now + i*0.15 + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, now + i*0.15 + 0.15);
                osc.start(now + i*0.15); osc.stop(now + i*0.15 + 0.15);
            });
        } else if (type === '3') {
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination); osc.type = 'triangle'; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i*0.2); gain.gain.linearRampToValueAtTime(0.2, now + i*0.2 + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + i*0.2 + 0.4);
                osc.start(now + i*0.2); osc.stop(now + i*0.2 + 0.4);
            });
        } else if (type === '4') {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square';
            osc.frequency.setValueAtTime(600, now); osc.frequency.setValueAtTime(800, now + 0.2); osc.frequency.setValueAtTime(600, now + 0.4); osc.frequency.setValueAtTime(800, now + 0.6);
            gain.gain.setValueAtTime(0.1, now); osc.start(now); osc.stop(now + 0.8);
        } else if (type === '5') {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = 440;
            gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.4, now + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            osc.start(now); osc.stop(now + 1.5);
        } else {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.3);
        }
    } catch(e) {}
}

function triggerAlarmRing(soundType) {
    document.getElementById('timer-controls-default').classList.add('hidden');
    document.getElementById('timer-controls-extend').classList.remove('hidden'); document.getElementById('timer-controls-extend').classList.add('flex');
    document.getElementById('timer-pulse-dot').classList.remove('bg-rose-500'); document.getElementById('timer-pulse-dot').classList.add('bg-amber-500');

    playAudioTone(soundType);
    if(alarmAudioInterval) clearInterval(alarmAudioInterval);
    let userInterval = state.userInfo?.alarmInterval || 1000;
    alarmAudioInterval = setInterval(() => { playAudioTone(soundType); }, userInterval);
}

export function stopRestTimer() {
    if (restTimerInterval) clearInterval(restTimerInterval);
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    document.getElementById('timer-floating-bar').className = "fixed bottom-0 left-0 w-full z-[70] transform translate-y-full opacity-0 transition-all duration-500 pointer-events-none";
}

export function extendRestTimer(secondsToAdd) {
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    document.getElementById('timer-controls-default').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('hidden'); document.getElementById('timer-controls-extend').classList.remove('flex');
    document.getElementById('timer-pulse-dot').classList.add('bg-rose-500'); document.getElementById('timer-pulse-dot').classList.remove('bg-amber-500');

    startTimerLogic(currentTimerSeconds + secondsToAdd, currentAlarmSound);
}

export function startTimerLogic(seconds, soundType) {
    if (restTimerInterval) clearInterval(restTimerInterval);
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);

    currentTimerSeconds = seconds; currentAlarmSound = soundType || '1';
    const bar = document.getElementById('timer-floating-bar');
    const display = document.getElementById('timer-countdown-display');
    document.getElementById('timer-controls-default').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('hidden');

    bar.className = "fixed bottom-0 left-0 w-full z-[70] transform translate-y-0 opacity-100 transition-all duration-500 pointer-events-auto shadow-[0_-10px_40px_rgba(245,158,11,0.2)]";
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    display.textContent = formatTime(currentTimerSeconds);

    restTimerInterval = setInterval(() => {
        currentTimerSeconds--;
        if (currentTimerSeconds <= 0) {
            clearInterval(restTimerInterval); display.textContent = "00:00"; triggerAlarmRing(currentAlarmSound);
        } else { display.textContent = formatTime(currentTimerSeconds); }
    }, 1000);
}
