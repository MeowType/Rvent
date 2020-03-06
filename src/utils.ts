export function* map<T, R>(iter: Iterable<T> | IterableIterator<T>, fn: (i: T) => R): Iterable<R> {
    for (const item of iter) {
        yield fn(item)
    }
}
export namespace Async {
    export async function* map<T, R>(iter: AsyncIterable<T> | AsyncIterableIterator<T>, fn: (i: T) => R | Promise<R>): AsyncIterable<R> {
        for await (const item of iter) {
            yield await fn(item)
        }
    }
}

export function delay(time: number) {
    return new Promise<void>(res => {
        setTimeout(() => res(), time)
    })
}

export function hasKey<K extends string | number | symbol, T extends { [k in K]: any }>(o: any, k: K): o is T {
    return k in o
}

export type Awaitable<T> = T | Promise<T>

export const Void: void = null as any
export type VNU = void | null | undefined

