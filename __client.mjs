const INTERSECTION_MARGIN = 100;

const options = {
  rootMargin: `0px 0px -${INTERSECTION_MARGIN}px 0px`,
  threshold: 0,
};

const getPageHeaders = () => [
  ...document.querySelectorAll('main h2:not(.omit-from-toc)'),
];

/**
 *
 * @param {(sectionIndex: number) => void} intersectionCallback Function to call whenever the section index changes
 * @returns Cleanup function to use within the page cleanup
 */
const watchSectionHeaders = (intersectionCallback = () => {}) => {
  let sectionIndex = -1;
  const headers = getPageHeaders();

  const handleIntersect = () => {
    const newSectionIndex = [...headers.entries()].reduce(
      (runningSectionIndex, [index, header]) => {
        const hasScrolledPastHeader =
          header.offsetTop <=
          window.scrollY + window.innerHeight - INTERSECTION_MARGIN;

        // if we've already scrolled past this header,
        // we're *at least* as far down as this section
        return hasScrolledPastHeader ? index : runningSectionIndex
        // we'll keep looping to see how far down the page we really are
      },
      -1
    );
    if (newSectionIndex !== sectionIndex) {
      sectionIndex = newSectionIndex;
      intersectionCallback(sectionIndex, headers);
    }
  };

  const observer = new IntersectionObserver(handleIntersect, options);
  headers.forEach((header) => observer.observe(header));

  return () => {
    observer.disconnect();
  }
};

const animateColoredAccent = (sectionIndex, headers) => {
  const allStripes = document.querySelectorAll('#line-accents > *');
  // in the case that sectionIndex = -1 (no section on screen),
  // this will come back null
  const selectedStripe = document.querySelector(
    `#line-accents > :nth-child(${sectionIndex + 1})`
  );
  for (let stripe of allStripes) {
    if (stripe === selectedStripe) {
      stripe.classList.add('active');
    } else {
      stripe.classList.remove('active');
    }
  }
};

const use11tyData = true;

var index = ({ data: { works } }) => {
  const unobserveHeaders = watchSectionHeaders(animateColoredAccent);

  function VideoEl(elementId) {
    this.el = document.getElementById(elementId);
    this.source = document.querySelector(`#${elementId} > source:first-of-type`);
    this.backupSource = document.querySelector(
      `#${elementId} > source:nth-of-type(2)`
    );
  }

  const manageProjects = () => {
    const firstVid = new VideoEl('projects-1');
    const secondVid = new VideoEl('projects-2');
    const titleEl = document.getElementById('projects-title');
    const bodyEl = document.getElementById('projects-body');
    const diceEl = document.getElementById('dice-container');

    let unusedIndices = [];
    const resetUnusedIndices = () =>
      (unusedIndices = [...Array(works.length).keys()]);
    resetUnusedIndices(); // set unused indices to list of indices up to projects.length
    unusedIndices.shift(); // remove index 0, since this is the initial index shown

    const newIndex = () => {
      if (unusedIndices.length === 0) resetUnusedIndices();

      const randIndex = Math.floor(Math.random() * unusedIndices.length);
      return unusedIndices.splice(randIndex, 1)
    };

    const setUpVideoEl = (video, index) => {
      video.source.src = works[index].videoSrc;
      video.backupSource.src = works[index].backupVideoSrc;
      video.el.poster = works[index].img.src;
      video.el.load();
    };

    let index = newIndex();
    setUpVideoEl(secondVid, index);

    const setProjectInfo = (nextVid, currVid) => {
      // wait for dice to hit the computer
      setTimeout(() => {
        titleEl.innerText = works[index].title;
        bodyEl.innerHTML = works[index].body;

        index = newIndex();
        nextVid.el.classList.add('visible');
        currVid.el.classList.remove('visible');
        setUpVideoEl(currVid, index);
      }, 400);
    };

    const triggerDiceRoll = () => {
      diceEl.classList.remove('animated');
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          diceEl.classList.add('animated');
        });
      });
    };

    let showFirst = false;
    return () => {
      triggerDiceRoll();
      const nextVid = showFirst ? firstVid : secondVid;
      const currVid = showFirst ? secondVid : firstVid;
      setProjectInfo(nextVid, currVid);
      showFirst = !showFirst;
    }
  };

  const nextProject = manageProjects();

  const clickListener = (event) => {
    if (event.target.id === 'generate-random-project') {
      nextProject();
    }
  };
  document.addEventListener('click', clickListener);

  return () => {
    unobserveHeaders();
    document.removeEventListener('click', clickListener);
  }
};

export default index;
export { use11tyData };
