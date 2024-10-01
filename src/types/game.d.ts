function strEnum<T extends string>(o: Array<T>): { [K in T]: K } {
    return o.reduce((res, key) => {
        res[key] = key;
        return res;
    }, Object.create(null));
}

const Game = strEnum(['maimai', 'chunithm']);

type Game = keyof typeof Game;

export { Game };