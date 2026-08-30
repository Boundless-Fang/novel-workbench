function formatNotice(type, message) {
    const labelMap = {
        info: "提示",
        success: "成功",
        error: "错误",
        confirm: "确认",
    };
    const label = labelMap[type] || "提示";
    const text = String(message ?? "").trim();
    return `【${label}】\n${text}`;
}

export function notifyInfo(message) {
    window.alert(formatNotice("info", message));
}

export function notifySuccess(message) {
    window.alert(formatNotice("success", message));
}

export function notifyError(message) {
    window.alert(formatNotice("error", message));
}

export function confirmAction(message) {
    return window.confirm(formatNotice("confirm", message));
}

