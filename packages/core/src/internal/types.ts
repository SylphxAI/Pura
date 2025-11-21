/**
 * Core type definitions
 */

// Transient owner for structural sharing
export type Owner = object | undefined;

// RRB-Tree node
export interface Node<T> {
  owner?: Owner;
  arr: any[];
  sizes?: number[];
}

// RRB-Tree persistent vector
export interface Vec<T> {
  count: number;
  shift: number;
  root: Node<T>;
  tail: T[];
  treeCount: number;
  tailOwner?: Owner;
}
