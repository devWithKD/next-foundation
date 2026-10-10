// Stand-in for `server-only` under vitest. The real package throws when
// imported outside a react-server build, which would block every server test.
export {};
