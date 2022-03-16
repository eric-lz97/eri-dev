/**
 * Uses regex to remove slashes from the start and end of a given url
 * @param {string} url An relative or absolute url to trim slashes from
 * @return {string} The url with slashes trimmed
 */
function trimSlashes(url = '') {
  return url.replace(/^\/+|\/+$/g, '')
}

const sleep = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration));

async function wipeAnimation(page, prevPage, destroyPrevPage) {
  const cssAnimDuration = getComputedStyle(
    document.querySelector('[data-page]')
  ).getPropertyValue('--nav-anim-duration');
  const animDuration = parseInt(cssAnimDuration) - 20

  ;(function slideInNewPage() {
    page.classList.toggle('slideIn');
    prevPage.classList.toggle('slideOut');
  })();

  await sleep(animDuration);
  page.classList.toggle('slideIn');
  destroyPrevPage();
}

var intersection = (listA = [], listB = []) => {
  const setA = new Set(listA);
  const intersection = new Set(listB.filter((b) => setA.has(b)));
  return intersection
};

/**
 * Takes in a variable number of arrays, and "zips" them together
 * into tuples based on their index
 * ex. [1, 2, 3], [4, 5, 6] -> [[1, 4], [2, 5], [3, 6]]
 * @param {...any} rows Arrays that should be zipped into tuples
 * @return Array.<Array.<any>> An array of tuples zipped from the given rows
 */
function zip(...rows) {
  return [...rows[0]].map((_, c) => rows.map((row) => row[c]))
}

const dataPageAttrs = (page) =>
  [...page.querySelectorAll('[data-page]')].map((el) => ({
    el,
    value: el.getAttribute('data-page'),
  }));

const getPageDiff = (page, prevPage) => {
  const [allPageEls, allPrevPageEls] = [page, prevPage].map(dataPageAttrs);

  const pageElPairs = zip(allPageEls, allPrevPageEls);
  for (let [left, right] of pageElPairs) {
    if (left.value !== right.value) {
      return [left.el, right.el]
    }
  }
  return [null, null]
};

var scrollIntoView = (event) => {
  const target = event.target;

  if (
    target.tagName === 'A' &&
    target.origin === location.origin &&
    target.hash
  ) {
    event.preventDefault();
    const el = document.querySelector(target.hash);
    el.scrollIntoView({ behavior: 'smooth' });
  }
};

const noop = () => {};
let prevPathname = location.pathname;
let cleanupFns = [];
let onLoadingFns = [];
let onLoadedFns = [];
let loading = false;

const loadNewStyles = (styles) =>
  Promise.all(
    styles.map(
      (style) =>
        new Promise((resolve, reject) => {
          const newStyle = document.head.appendChild(style);
          newStyle.onload = resolve;
          // TODO: stop silently failing on bad stylesheets
          // Necessary evil right now, since we always have styles even when the file is nonexistent!
          newStyle.onerror = resolve;
        })
    )
  );

const resolveStyles = async (fullPage) => {
  const stylesheetSelector = 'head > link[rel="stylesheet"]';
  const oldStyles = [...document.querySelectorAll(stylesheetSelector)];
  const newStyles = [...fullPage.querySelectorAll(stylesheetSelector)];

  const overlappingStyles = intersection(
    oldStyles.map(({ href }) => href),
    newStyles.map(({ href }) => href)
  );

  await loadNewStyles(
    // only load styles that *aren't already on the page*
    newStyles.filter((style) => !overlappingStyles.has(style.href))
  );

  return () =>
    oldStyles.forEach((style) => {
      if (!overlappingStyles.has(style.href)) {
        document.head.removeChild(style);
      }
    })
};

const animatePageIntoView = async (fullPage) => {
  const [page, prevPage] = getPageDiff(fullPage, document);
  const layoutContainer = prevPage.parentElement;
  layoutContainer.style.position = 'relative';
  layoutContainer.insertBefore(page, prevPage);

  await new Promise((resolve) => {
    requestAnimationFrame(async () => {
      await wipeAnimation(page, prevPage, () =>
        layoutContainer.removeChild(prevPage)
      );
      resolve();
    });
  });
};

const yoinkHTML = async (href) => {
  const response = await fetch(href);
  const htmlString = await response.text();
  const page = new DOMParser().parseFromString(htmlString, 'text/html');
  const title = page.querySelector('title').innerText;

  return { page, title }
};

const yoinkLayoutJS = async (pageHTML = document) => {
  const layoutNames = dataPageAttrs(pageHTML)
    .map((attr) => attr.value)
    .filter((dataPage) => dataPage.startsWith('_layouts'));
  layoutNames.push('_layouts');
  return await Promise.all(layoutNames.map((layoutName) => yoinkJS(layoutName)))
};

const yoinkJS = async (pathname) => {
  try {
    const pathnameWithTrailingSlash = pathname ? pathname + '/' : pathname;
    const jsModule = await import(`./${pathnameWithTrailingSlash}__client.mjs`);
    const onLoading = (callback = () => {}) => {
      onLoadingFns.push(callback);
    };
    if (!jsModule) return noop
    const data = jsModule.use11tyData
      ? await import(`./${pathnameWithTrailingSlash}__data.mjs`)
      : {};

    return () => jsModule.default({ data: data.default, onLoading })
  } catch (e) {
    return noop
  }
};

const setPageTitle = (title = '') => {
  const titleEl = document.querySelector('title');
  if (titleEl) {
    titleEl.innerText = title;
  } else {
    const titleEl = document.createElement('title');
    titleEl.innerText = title;
    document.documentElement.appendChild(titleEl);
  }
};

const popAndRun = (cleanupArr = []) => {
  while (cleanupArr.length) cleanupArr.pop()();
};

const runAndPushReturn = (jsArr = [], cleanupArr = []) => {
  for (const fn of jsArr) cleanupArr.push(fn() ?? noop);
};

const sequenceProcessHTMLLayoutJS = async (href = '') => {
  const { page, title } = await yoinkHTML(href);
  const layoutJSList = await yoinkLayoutJS(page);
  return { page, title, layoutJSList }
};

const setVisiblePage = async ({ pathname = '', href = '' }) => {
  loading = true;
  setTimeout(() => {
    if (loading === true) runAndPushReturn(onLoadingFns, onLoadedFns);
  }, 100);
  const [{ page, title, layoutJSList }, mainJS] = await Promise.all([
    sequenceProcessHTMLLayoutJS(href),
    yoinkJS(trimSlashes(pathname)),
  ]);
  setPageTitle(title);
  const removeOldStyles = await resolveStyles(page);
  loading = false;
  popAndRun(onLoadedFns);
  popAndRun(cleanupFns);
  await animatePageIntoView(page);
  removeOldStyles();
  // TODO: on quick navigation, it's possible to run the next page function
  // before the previous cleanup finishes
  // will probably need a queuing system to solve this
  runAndPushReturn([mainJS, ...layoutJSList], cleanupFns);
  prevPathname = pathname;
};

document.addEventListener('click', async (event) => {
  const { target } = event;
  if (target.tagName === 'A' && target.origin === location.origin) {
    event.preventDefault();
    scrollIntoView(event);
    if (target.pathname !== prevPathname) {
      history.pushState({}, null, target.href);
      await setVisiblePage(target);
    }
  }
});

onpopstate = () => {
  if (location.hash === '' && location.pathname !== prevPathname) {
    setVisiblePage(location);
  }
}

// on startup
;(async () => {
  const [mainJS, layoutJSList] = await Promise.all([
    yoinkJS(trimSlashes(location.pathname)),
    yoinkLayoutJS(),
  ]);
  runAndPushReturn([mainJS, ...layoutJSList], cleanupFns);
})();
