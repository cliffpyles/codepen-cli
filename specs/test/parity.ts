/** Type helpers for the type parity tests: which fields of a hand-written type differ from the generated one, and how. */

/** True when A and B are the same type. */
export type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless T is true. */
export type Assert<T extends true> = T;

/** Declared keys, without index signatures. */
export type KnownKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type Shared<Hand, Gen> = KnownKeys<Hand> & KnownKeys<Gen>;

/** Fields whose generated type is not assignable to the hand-written one: real data the CLI's type rejects. */
export type Conflicting<Hand, Gen> = {
  [K in Shared<Hand, Gen>]: [Gen[K]] extends [Hand[K]] ? never : K;
}[Shared<Hand, Gen>];

/** Fields where the hand-written type accepts more than the spec, such as an optional field the spec requires. */
export type Looser<Hand, Gen> = {
  [K in Shared<Hand, Gen>]: [Gen[K]] extends [Hand[K]]
    ? [Hand[K]] extends [Gen[K]]
      ? never
      : K
    : never;
}[Shared<Hand, Gen>];

/** Fields the spec has and the hand-written type does not declare. */
export type Missing<Hand, Gen> = Exclude<KnownKeys<Gen>, KnownKeys<Hand>>;

/** Fields the hand-written type declares and the spec does not have. */
export type HandOnly<Hand, Gen> = Exclude<KnownKeys<Hand>, KnownKeys<Gen>>;

/** All four lists for one pair of types. */
export interface Differences<Hand, Gen> {
  conflicting: Conflicting<Hand, Gen>;
  looser: Looser<Hand, Gen>;
  missing: Missing<Hand, Gen>;
  handOnly: HandOnly<Hand, Gen>;
}
