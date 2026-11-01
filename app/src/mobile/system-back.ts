/**
 * 手机端系统返回键的「返回栈」。
 *
 * App 启动时由 `MobileApp` 注册唯一的 Tauri 返回键监听；设置页、聊天页在挂载时压入
 * 自己的处理函数。按下返回键时从栈顶往下问，谁处理了谁负责（返回 true）；
 * 全部返回 false 就是退到了宠物主界面，由根页面决定退出策略。
 *
 * 注意：这里只登记「语义层」，不碰 Tauri API，方便在组件测试里直接调用 `handleBack()`。
 */

type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** 压入一层返回处理；后压入的优先（对应更上层的界面）。返回退订函数。 */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** 从最上层向下询问；返回 false 表示已到根页面，没有界面消费这次返回。 */
export function handleBack(): boolean {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    const handler = handlers[index];
    if (handler?.()) return true;
  }
  return false;
}

/** 清空返回栈（仅测试/热重载用，正常由组件卸载时退订）。 */
export function clearBackHandlers(): void {
  handlers.length = 0;
}
