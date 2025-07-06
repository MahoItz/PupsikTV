# PupsikTV

This project is a simple static site for managing a movie list. It expects a Supabase API key to be available at runtime.

## Configuring the API key

Before serving the site, make sure `window.SUPABASE_API_KEY` is defined. The simplest approach is to replace the placeholder value in `index.html` during your build or deployment step:

```html
<script>
  window.SUPABASE_API_KEY = "YOUR_SUPABASE_KEY";
</script>
```

If the key is not provided, `script.js` will log an error message in the browser console.
