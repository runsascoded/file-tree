# Theming

The library ships no CSS and defines no palette. Every surface it draws is either inherited (text color, font) or a 50%-gray alpha — `rgba(127,127,127,0.08)` fills, `…,0.4)` borders — which reads correctly against a light *or* a dark background without knowing which it's on. So `<FileTree>` adopts the host page's theme rather than imposing one, and there's nothing to configure in the common case.

The one thing it can't infer is a theme your app keeps in application state. If you have your own toggle, mirror it onto [`color-scheme`] at the root — that's what tells the browser which UA defaults to hand down, and it's what FileTree ends up inheriting:

```ts
document.documentElement.setAttribute('data-theme', theme)   // your styles
document.documentElement.style.colorScheme = theme           // the UA's, and ours
```

Set only the first and a dark app gets a light-looking file tree: your CSS recolors your components, but the UA defaults FileTree inherits are still the light ones.

[`color-scheme`]: https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme
