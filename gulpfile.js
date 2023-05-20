const gulp = require('gulp');
const gutil = require('gulp-util');
const mocha = require('gulp-mocha');
const mochaPhantomJS = require('gulp-mocha-phantomjs');
const webserver = require('gulp-webserver');
const del = require('del');
const path = require('path');
const source = require('vinyl-source-stream');
const through = require('through2');
const browserify = require('browserify');
const licensify = require('licensify');
const derequire = require('gulp-derequire');
const dereserve = require('gulp-dereserve');

const config = {
  bundle: {
    standalone: 'empower',
    srcFile: './index.js',
    destDir: './build',
    destName: 'empower.js',
  },
  assert_bundle: {
    standalone: 'assert',
    require: 'assert',
    destDir: './build',
    destName: 'assert.js',
  },
  acorn_es7_plugin_bundle: {
    standalone: 'acornEs7Plugin',
    require: 'acorn-es7-plugin',
    destDir: './build',
    destName: 'acorn-es7-plugin.js',
  },
  escodegen_bundle: {
    standalone: 'escodegen',
    srcFile: './node_modules/escodegen/escodegen.js',
    destDir: './build',
    destName: 'escodegen.js',
  },
  coverage: {
    filename: 'coverage.lcov',
  },
  test: {
    base: './test/',
    pattern: '**/*_test.js',
    amd: 'test/test-amd.html',
    browser: 'test/test-browser.html',
  },
};

const BUILDS = ['assert', 'escodegen', 'acorn_es7_plugin'];

const captureStdout = (filespec) => {
  let orig;
  let log = '';

  const spy = (str) => {
    log += str;
  };
  const pass = (file, _encoding, callback) => {
    this.push(file);
    callback();
  };

  return {
    start: through.obj(
      pass,
      (callback) => {
        orig = process.stdout.write;
        process.stdout.write = spy;
        callback();
      }
    ),
    finish: through.obj(
      pass,
      (callback) => {
        const file = new gutil.File(filespec);
        file.contents = Buffer.from(log);
        this.push(file);
        process.stdout.write = orig;
        log = '';
        orig = null;
        callback();
      }
    ),
  };
};

const runMochaWithBlanket = () => {
  require('./coverage/blanket');

  const capt = captureStdout({
    cwd: __dirname,
    base: __dirname,
    path: path.join(__dirname, config.coverage.filename),
  });

  return gulp
    .src(config.test.base + config.test.pattern, { read: false })
    .pipe(capt.start)
    .pipe(
      mocha({
        ui: 'tdd',
        reporter: 'mocha-lcov-reporter',
        require: ['babel-core/polyfill'],
      })
    )
    .pipe(capt.finish)
    .pipe(gulp.dest('.'))
    .on('error', gutil.log);
};

const runMochaSimply = () => gulp
  .src(config.test.base + config.test.pattern, { read: false })
  .pipe(
    mocha({
      ui: 'tdd',
      reporter: 'dot',
      require: ['babel-core/polyfill'],
    })
  )
  .on('error', gutil.log);

gulp.task('serve', () => gulp
  .src(__dirname)
  .pipe(
    webserver({
      port: 9001,
      directoryListing: true,
    })
  ));

gulp.task('watch', () => {
  gulp.watch(['index.js', '{lib,test}/**/*.js'], runMochaSimply);
  runMochaSimply();
});

gulp.task('clean_bundle', () => {
  return del([config.bundle.destDir]);
});

gulp.task('clean_coverage', () => {
  return del([config.coverage.filename]);
});

gulp.task('bundle', gulp.series('clean_bundle', () => {
  const b = browserify({ entries: config.bundle.srcFile, standalone: config.bundle.standalone });
  b.plugin(licensify);

  return b.bundle()
    .pipe(source(config.bundle.destName))
    .pipe(dereserve())
    .pipe(derequire())
    .pipe(gulp.dest(config.bundle.destDir));
}));

BUILDS.forEach(name => {
  gulp.task(`clean_${name}_bundle`, () => {
    return del([path.join(config[`${name}_bundle`].destDir, config[`${name}_bundle`].destName)]);
  });
  gulp.task(
    `${name}_bundle`,
    gulp.series(`clean_${name}_bundle`, () => {
      const b = browserify({ standalone: config[`${name}_bundle`].standalone });

      if (config[`${name}_bundle`].srcFile) {
        b.add(config[`${name}_bundle`].srcFile);
      }
      if (config[`${name}_bundle`].require) {
        b.require(config[`${name}_bundle`].require);
      }
      return b
        .bundle()
        .pipe(source(config[`${name}_bundle`].destName))
        .pipe(derequire())
        .pipe(gulp.dest(config[`${name}_bundle`].destDir));
    })
  );
});

gulp.task('clean_deps', gulp.parallel(BUILDS.map(name => `clean_${name}_bundle`)));
gulp.task('build_deps', gulp.parallel(BUILDS.map(name => `${name}_bundle`)));

gulp.task('unit', runMochaSimply);

gulp.task('coverage', gulp.series('clean_coverage', runMochaWithBlanket));

gulp.task('test_amd', gulp.series('bundle', 'build_deps', () => gulp
  .src(config.test.amd)
  .pipe(mochaPhantomJS({ reporter: 'dot' }))
));

gulp.task('test_browser', gulp.series('bundle', 'build_deps', () => gulp
  .src(config.test.browser)
  .pipe(mochaPhantomJS({ reporter: 'dot' }))
));

gulp.task('clean', gulp.parallel('clean_coverage', 'clean_bundle', 'clean_deps'));

gulp.task('test', gulp.series('unit', 'test_browser', 'test_amd'));
