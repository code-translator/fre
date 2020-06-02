import { ITask, ITaskCallback, IVoidCb } from './type'
import { isFn } from './reconciler'

let taskQueue: ITask[] = []
let currentCallback: ITaskCallback | undefined
/** 当前 frame 的结束时间，避免 JS 占用太多时间 */
let frameDeadline: number = 0
const frameLength: number = 5

/**
 * 1. 创建一个新的 task 放入到 taskQueue
 * 2. 修改 currentCallback 为 flush 函数
 * @param callback 调度的回掉函数，默认是 reconcileWork
 */
export const scheduleCallback = (callback: ITaskCallback): void => {
  const currentTime = getTime()
  const timeout = 3000
  const dueTime = currentTime + timeout

  let newTask = {
    callback,
    dueTime
  }

  taskQueue.push(newTask)
  currentCallback = flush as ITaskCallback
  planWork(null)
}

/**
 * 遍历 tashQueue
 * @param iniTime {number}
 */
const flush = (iniTime: number): boolean => {
  let currentTime = iniTime
  let currentTask = peek(taskQueue)

  while (currentTask) {
    const timeout = currentTask.dueTime <= currentTime
    if (!timeout && shouldYeild()) break

    /** callback 是 reconcileWork */
    let callback = currentTask.callback
    currentTask.callback = null

    let next = isFn(callback) && callback(timeout)
    next ? (currentTask.callback = next) : taskQueue.shift()

    currentTask = peek(taskQueue)
    currentTime = getTime()
  }

  return !!currentTask
}

/**
 * 所有 task 按时间排序，取出最早截至（优先级最高）的 task
 * @param queue 
 * @returns {ITask} 最早截至（优先级最高）的 task
 */
const peek = (queue: ITask[]) => {
  queue.sort((a, b) => a.dueTime - b.dueTime)
  return queue[0]
}

const flushWork = (): void => {
  if (isFn(currentCallback)) {
    let currentTime = getTime()
    frameDeadline = currentTime + frameLength
    let more = currentCallback(currentTime)
    more ? planWork(null) : (currentCallback = null)
  }
}

/**
 * 异步执行 callback，callback 默认是 flushWork
 * 针对 requestAnimationFrame 支持情况做的 polyfill
 * 
 * @NOTE requestAnimationFrame回调在帧首执行，用来计算当前帧的截止时间并开启递归，messageChannel的回调在帧末执行，根据当前帧的截止时间、当前时间、任务链表第一个任务的过期时间来决定当前帧是否执行任务（或是到下一帧执行）
 * @url https://github.com/facebook/react/pull/14234
 */
export const planWork: (cb?: IVoidCb | undefined) => number | void = (() => {
  if (typeof MessageChannel !== 'undefined') {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = flushWork
    return (cb?: IVoidCb) =>
      cb ? requestAnimationFrame(cb) : port2.postMessage(null)
  }
  return (cb?: IVoidCb) => setTimeout(cb || flushWork)
})()

/**
 * 是否该终止 taskQueue 执行
 */
export const shouldYeild = (): boolean => {
  return getTime() >= frameDeadline
}

export const getTime = () => performance.now()