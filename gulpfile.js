const fs = require('fs')
const { series, src } = require('gulp')
const gulp = require('gulp')
// const ts = require('gulp-typescript')
// const less = require('gulp-less')
// const tsProject = ts.createProject('tsconfig.json')
// const merge = require('merge-stream')
// const path = require('path')


function clean(next) {
    if (!fs.existsSync('dist')) { fs.mkdirSync('dist'); }
    next()
}

function less(next) {
        src('src/app.less')
        .pipe(less())
        .pipe(gulp.dest('dist', { overwrite: true }))
    next()
}

// gulp.task('clean', cb => {
//     rmDir('dist')
//     cb()
// })

// gulp.task('compile:less:lime', () => {
//     return gulp.src('src/lime.less')
//         .pipe(less())
//         .pipe(gulp.dest('dist', { overwrite: true }))
// })

// gulp.task('compile:less:each', () => {
//     return gulp.src(['src/**/*.less','!src/**/individual*.less'])
//         .pipe(less())
//         .pipe(gulp.dest('dist', { overwrite: true }))
// })

// gulp.task('compile:tsx', () => {
//     const tsOutput = gulp.src(['src/**/*.tsx', 'src/**/*.ts', 'src/index.js'])
//         .pipe(tsProject())
//     return merge(tsOutput, tsOutput.js).pipe(gulp.dest('dist', { overwrite: true }))
// })

// gulp.task('copy:package', cb => {
//     copyFile('package.json', 'dist/package.json')
//     copyFile('readme.md', 'dist/readme.md')
//     cb()
// })

// gulp.task('default', ['clean', 'compile:less:lime','compile:less:each', 'compile:tsx', 'copy:package'])

function copyFile(source, target) {
    fs.createReadStream(source).pipe(fs.createWriteStream(target));
}

function rmDir(dirPath, removeSelf = false) {
    let files
    try {
        files = fs.readdirSync(dirPath)
    }
    catch (e) {
        console.error(e)
        return;
    }

    if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            let filePath = path.join(dirPath, files[i])
            if (fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
            }
            else {
                rmDir(filePath, true)
            }
        }
    }

    if (removeSelf) {
        fs.rmdirSync(dirPath)
    }
}

exports.default = series(clean)