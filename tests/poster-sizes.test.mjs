import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

class Element {
  constructor(tag = '') {
    this.tag = tag;
    this.children = [];
    this.style = {};
    this.value = '';
    this.classList = { add() {} };
  }
  appendChild(child) {
    this.children.push(child);
    if (this.tag === 'select' && !this.value) this.value = child.value;
    return child;
  }
  set innerHTML(value) {
    if (!value) this.children = [];
  }
  setAttribute() {}
  addEventListener(name, fn) {
    this[name] = fn;
  }
}

test('poster size filter uses available originals and selection saves the original URL', () => {
  const source = readFileSync(
    new URL('../script/admin.js', import.meta.url),
    'utf8'
  );
  const start = source.indexOf('function createPosterOverlay(');
  const end = source.indexOf('\nfunction initFileUpload()', start);
  const parent = new Element();
  parent.insertAdjacentElement = (_, overlay) => {
    parent.overlay = overlay;
  };
  const target = { parentElement: parent, src: '', id: 'preview' };
  const context = {
    document: { createElement: (tag) => new Element(tag) },
    steamGridPoster: null,
  };
  vm.runInNewContext(source.slice(start, end), context);
  context.createPosterOverlay(
    target,
    [
      { url: 'full-small', thumb: 'thumb-small', width: 342, height: 482 },
      {
        url: 'full-recommended',
        thumb: 'thumb-recommended',
        width: 600,
        height: 900,
      },
      { url: 'full-large', thumb: 'thumb-large', width: 660, height: 930 },
    ],
    true
  );
  const [select, row] = parent.overlay.children;
  const [, container, next] = row.children;
  assert.equal(select.value, '600x900');
  assert.match(select.children[0].textContent, /рекомендуется/);
  assert.equal(container.children[0].children[1].src, 'thumb-recommended');
  container.children[0].children[1].onclick();
  assert.equal(context.steamGridPoster, 'full-recommended');
  assert.equal(target.src, 'full-recommended');
  select.value = '660x930';
  select.change();
  assert.equal(container.children[0].children[1].src, 'thumb-large');
  assert.equal(next.style.visibility, 'hidden');
  container.children[0].children[1].onclick();
  assert.equal(context.steamGridPoster, 'full-large');
});

test('poster optimization fits a large source into 440 by 660 without enlarging small images', async () => {
  const source = readFileSync(
    new URL('../script/admin.js', import.meta.url),
    'utf8'
  );
  const start = source.indexOf('const POSTER_MAX_WIDTH');
  const end = source.indexOf('\nasync function readFileAsDataURL', start);
  let dimensions = [600, 900];
  let canvas;
  let outputQuality;
  class ImageStub {
    set src(value) {
      this.naturalWidth = dimensions[0];
      this.naturalHeight = dimensions[1];
      queueMicrotask(() => this.onload());
    }
  }
  const context = {
    Image: ImageStub,
    URL: { createObjectURL: () => 'blob:poster', revokeObjectURL() {} },
    document: {
      createElement: () => {
        canvas = {
          toDataURL: () => 'data:image/webp;base64,test',
          getContext: () => ({ drawImage() {} }),
          toBlob: (callback, type, quality) => {
            outputQuality = quality;
            callback({ type });
          },
        };
        return canvas;
      },
    },
    FileReader: class {
      readAsDataURL() {
        this.result = 'data:image/webp;base64,test';
        queueMicrotask(() => this.onload());
      }
    },
    queueMicrotask,
  };
  vm.runInNewContext(source.slice(start, end), context);
  await context.optimizeImageBlobToDataURL({ type: 'image/png' });
  assert.deepEqual(
    [canvas.width, canvas.height, outputQuality],
    [440, 660, 0.8]
  );
  dimensions = [342, 482];
  await context.optimizeImageBlobToDataURL({ type: 'image/png' });
  assert.deepEqual([canvas.width, canvas.height], [342, 482]);
});
