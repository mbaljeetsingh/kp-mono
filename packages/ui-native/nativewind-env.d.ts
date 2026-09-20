/// <reference types="react-native-css/types" />

// This is what teaches TypeScript that `className` exists on React Native's
// components. Without it every Reusables component fails to typecheck on its
// own, even though it bundles and renders perfectly — the app has the same
// reference, so the errors only appear when this package is checked alone.
