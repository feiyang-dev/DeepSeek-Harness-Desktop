'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dsh', {
  // ---- 模式选择 ----
  // 选择安装模式：'quick' 快速启动 | 'source' 源码完整安装
  selectMode: (mode) => ipcRenderer.invoke('boot:select-mode', mode),
  // 倒计时事件
  onModeCountdown: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('boot:mode-countdown', listener);
    return () => ipcRenderer.removeListener('boot:mode-countdown', listener);
  },
  // 阶段切换（mode/detect/install/start/ready/error）
  onPhase: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('boot:phase', listener);
    return () => ipcRenderer.removeListener('boot:phase', listener);
  },

  // ---- 进度条 ----
  onProgress: (cb) => {
    const listener = (_e, progress) => cb(progress);
    ipcRenderer.on('boot:progress', listener);
    return () => ipcRenderer.removeListener('boot:progress', listener);
  },

  // ---- 命令行日志 ----
  onLog: (cb) => {
    const listener = (_e, text) => cb(text);
    ipcRenderer.on('boot:log', listener);
    return () => ipcRenderer.removeListener('boot:log', listener);
  },

  // ---- 错误状态 ----
  onStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on('boot:status', listener);
    return () => ipcRenderer.removeListener('boot:status', listener);
  },

  // ---- 操作 ----
  retry: () => ipcRenderer.invoke('boot:retry'),
  quit: () => ipcRenderer.invoke('boot:quit'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),

  // ---- 关于 ----
  getAboutInfo: () => ipcRenderer.invoke('app:about-info'),
});
