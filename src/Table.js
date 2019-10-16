import React from 'react'
import { Context } from './context'
import debounce from 'lodash/debounce'
import Header from './Header'
import Body from './Body'
import Pagination from './Pagination'
import { flatten, createColumnMeta, forEachLeafColumn, depthOf, groupByDepth } from './util'
import SyncScrolling from './SyncScrolling'

const doNothing = () => { }
const loadingLayout = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    opacity: .5,
    transition: 'opacity .3s',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
}

export default class SwiftTable extends React.Component {
    static defaultProps = {
        children: <React.Fragment><Header /><Body /></React.Fragment>,
        defaultSorter: {},
        onChangeSorter: doNothing,
        onChangeFilters: doNothing,
        onChangePaging: doNothing,
        rowHeight: 30
    }

    constructor(props) {
        super(props)
        this.root = React.createRef()
        this.filterLayersRef = React.createRef()
        this.isInit = false
        this.activeSorter = { columnMetaKey: '', direction: '' }
        this.tableDidMountListeners = new Map()
        this.activeFilters = new Map()
        this.syncScrollingInstance = new SyncScrolling()
        this.dimensionInfo = {}
        this.resizedWidthInfo = new Map()
        this.debouncedUpdate = debounce(this._update, 40)
        this.debouncedReSyncWidthAndHeight = debounce(this.reSyncWidthAndHeight, 100)

        this.contextAPI = {
            getFilterLayerContainer: this.getFilterLayerContainer,

            getDefaultFilters: this.getDefaultFilters,
            getFilters: this.getFilters,
            setActiveFilter: this.setActiveFilter,
            getActiveFilters: this.getActiveFilters,
            removeActiveFilter: this.removeActiveFilter,
            onChangeFilters: props.onChangeFilters,

            getDefaultSorter: this.getDefaultSorter,
            getSorter: this.getSorter,
            setActiveSorter: this.setActiveSorter,
            getActiveSorter: this.getActiveSorter,
            onChangeSorter: props.onChangeSorter,

            addEventListener: this.addEventListener,
            removeEventListener: this.removeEventListener,

            syncScrolling: this.syncScrolling,
            removeSyncScrolling: this.removeSyncScrolling,

            reSyncWidthAndHeight: this.debouncedReSyncWidthAndHeight,

            getColGroups: this.getColGroups,

            setResizedWidthInfo: this.setResizedWidthInfo,

            isInit: () => this.isInit,
        }
        this.state = {
            pageNo: 'defaultPageNo' in props ? props.defaultPageNo : 1,
            pageSize: 'defaultPageSize' in props ? props.defaultPageSize : 10,
        }
        this.defaultFilters = 'defaultFilters' in props ? Array.from(props.defaultFilters) : undefined
        this.defaultSorter = 'defaultSorter' in props ? props.defaultSorter : undefined
    }

    get pageNo() {
        return 'pageNo' in this.props ? this.props.pageNo : this.state.pageNo
    }

    get pageSize() {
        return 'pageSize' in this.props ? this.props.pageSize : this.state.pageSize
    }

    get total() {
        return 'total' in this.props ? this.props.total : this.props.data ? this.props.data.length : 0
    }

    get isPaging() {
        const pageSize = 'pageSize' in this.props ? true : false
        const pageSizeOptions = 'pageSizeOptions' in this.props ? true : false
        return pageSize || pageSizeOptions
    }

    get isClientPaging() {
        const total = 'total' in this.props ? true : false
        return this.isPaging && !total
    }

    getDefaultFilters = () => {
        return this.defaultFilters
    }

    getFilters = () => {
        return this.props.filters
    }

    getActiveFilters = () => {
        return this.activeFilters
    }

    setActiveFilter = ({ columnMetaKey, dataKey, value, name, by }) => {
        const previous = this.activeFilters.get(columnMetaKey) || {}
        if (previous.dataKey !== dataKey || previous.value !== value) {
            this.activeFilters.set(columnMetaKey, { value, name, dataKey, by })
            this._update()
        }
    }

    removeActiveFilter = columnMetaKey => {
        if (this.activeFilters.has(columnMetaKey)) {
            this.activeFilters.delete(columnMetaKey)
            this._update()
        }
    }

    getDefaultSorter = () => {
        return this.defaultSorter
    }

    getSorter = () => {
        return this.props.sorter
    }

    setActiveSorter = ({ columnMetaKey, dataKey, direction, by }) => {

        if (dataKey !== this.activeSorter.key || direction !== this.activeSorter.direction) {
            this.activeSorter = { columnMetaKey, key: dataKey, direction, by }
            this._update()
        }
    }

    // used when user resize column
    setResizedWidthInfo = (metaKey, width) => {
        this.resizedWidthInfo.set(metaKey, width)
    }

    getActiveSorter = () => {
        return this.activeSorter
    }

    getFilterLayerContainer = columnMetaKey => {
        return this.filterLayersRef.current.getElementsByClassName(columnMetaKey)[0]
    }

    getColGroups = evt => {
        const findDOM = find.bind(null, this.root.current)
        const roots = []
        const colgroups = []
        // header
        const [headerWrapper, headerRoot, header] = findDOM('header')
        const [leftHeaderWrapper, leftHeaderRoot, leftHeader] = findDOM('header', 'left')
        const [rightHeaderWrapper, rightHeaderRoot, rightHeader] = findDOM('header', 'right')

        // body
        const [bodyWrapper, bodyRoot, body] = findDOM('body')
        const [leftBodyWrapper, leftBodyRoot, leftBody] = findDOM('body', 'left')
        const [rightBodyWrapper, rightBodyRoot, rightBody] = findDOM('body', 'right')

        const headerColGroup = headerRoot.getElementsByTagName('colgroup')[0]
        const leftHeaderColGroup = leftHeaderRoot.getElementsByTagName('colgroup')[0]
        const rightHeaderColGroup = rightHeaderRoot.getElementsByTagName('colgroup')[0]
        const bodyColGroup = bodyRoot.getElementsByTagName('colgroup')[0]
        const leftBodyColGroup = leftBodyRoot.getElementsByTagName('colgroup')[0]
        const rightBodyColGroup = rightBodyRoot.getElementsByTagName('colgroup')[0]

        headerColGroup ? colgroups.push(headerColGroup) : undefined
        leftHeaderColGroup ? colgroups.push(leftHeaderColGroup) : undefined
        rightHeaderColGroup ? colgroups.push(rightHeaderColGroup) : undefined
        bodyColGroup ? colgroups.push(bodyColGroup) : undefined
        leftBodyColGroup ? colgroups.push(leftBodyColGroup) : undefined
        rightBodyColGroup ? colgroups.push(rightBodyColGroup) : undefined

        headerRoot ? roots.push(headerRoot) : undefined
        leftHeaderRoot ? roots.push(leftHeaderRoot) : undefined
        rightHeaderRoot ? roots.push(rightHeaderRoot) : undefined
        bodyRoot ? roots.push(bodyRoot) : undefined
        leftBodyRoot ? roots.push(leftBodyRoot) : undefined
        rightBodyRoot ? roots.push(rightBodyRoot) : undefined

        const minWidthArray = Array.from(this.dimensionInfo.originalMaxWidthArray)

        return [roots, colgroups, minWidthArray]
    }

    addEventListener = (type = 'tableDidMount', func) => {
        switch (type) {
            case 'tableDidMount':
                this.tableDidMountListeners.set(func, '')
                break
            default:
                throw `invalid event type: ${type}`
        }
    }

    removeEventListener = (type = 'tableDidMount', func) => {
        switch (type) {
            case 'tableDidMount':
                this.tableDidMountListeners.delete(func, '')
                break
            default:
                throw `invalid event type: ${type}`
        }
    }

    syncScrolling = (scrollable, mode = 'scrollLeft') => {
        this.syncScrollingInstance.add(scrollable, mode)
    }

    removeSyncScrolling = scrollable => {
        this.syncScrollingInstance.remove(scrollable)
    }

    sort = data => {
        const result = Array.from(data)
        const { key, direction, by } = this.getActiveSorter() // typescript?
        if (key && direction && direction !== 'default' && typeof by === 'function') {
            result.sort((a, b) => by(a[key], b[key]))
            if (direction === 'des') result.reverse()
        }

        return result
    }

    filter = data => {
        let result = data
        this.activeFilters.forEach(f => {

            const { dataKey, by, value } = f
            // console.log(`by`, by)
            result = result.filter(row => by(row[dataKey], value, row))
        })
        // console.log(`result`, result)
        return result
    }

    filterAndSort = data => {
        let result = data
        // console.log(`original`,data)
        result = this.filter(result)
        // console.log(`filtered`,result)
        result = this.sort(result)
        return result
    }

    paging = data => {
        const { pageNo, pageSize } = this
        const start = (pageNo - 1) * pageSize
        // console.log(`this.isClientPaging `,this.isClientPaging )
        return this.isClientPaging ? data.slice(start, start + pageSize) : data
    }

    onGoToPage = pageNo => {
        let next
        next = Math.max(1, pageNo)
        next = Math.min(Math.ceil(this.total / this.pageSize), next)
        this.setState({ pageNo: next }, () => {
            this.props.onChangePaging({ pageNo: next, pageSize: this.pageSize })
        })
    }

    setPageSize = pageSize => {
        this.setState({ pageSize }, () => {
            this.props.onChangePaging({ pageNo: this.pageNo, pageSize })
        })
    }

    _update = () => {
        this.forceUpdate()
    }

    reSyncWidthAndHeight = () => {
        const { rowHeight } = this.props
        const { root, flattenSortedColumns } = this
        const columns = flattenSortedColumns
        const isReSized = isDimensionChanged(
            root.current,
            columns.length,
            this.dimensionInfo
        )
        if (isReSized) {
            console.log(`in resize`,)
            syncWidthAndHeight(
                root.current,
                columns,
                rowHeight,
                this.dimensionInfo,
                this.resizedWidthInfo
            )
        }
    }

    componentDidUpdate() {
        // console.log(`table did`, this.isInit)
        // this.reSyncWidthAndHeight()
        this.debouncedReSyncWidthAndHeight()
    }

    componentDidMount() {
        const { dimensionInfo, flattenSortedColumns, root, resizedWidthInfo } = this
        const { rowHeight } = this.props
        syncWidthAndHeight(root.current, flattenSortedColumns, rowHeight, dimensionInfo, resizedWidthInfo)
        this.isInit = true
        window.requestAnimationFrame(() => {
            this.tableDidMountListeners.forEach((v, k) => k())
            // this.debouncedUpdate()
            this._update()
        })
    }

    render() {
        const {
            className = '',
            columns = [],
            data = [],
            style,
            loading: Loading,
            pageSizeOptions,
        } = this.props
        const columnsWithMeta = createColumnMeta(columns, depthOf(columns))

        this.sortedColumns = sortColumns(columnsWithMeta)
        this.data = this.filterAndSort(data)
        this.data = this.paging(this.data)
        this.flattenSortedColumns = flatten(this.sortedColumns)

        return (
            <div className={`swift-table ${className}`} ref={this.root} style={{ position: 'relative', ...style }}>
                <div ref={this.filterLayersRef}>
                    {
                        groupByDepth(this.sortedColumns).map((levelColumns, i) => {
                            return levelColumns.map(column => (
                                <div className={`swift-table-filter-layer-container ${column.metaKey}`} key={column.metaKey}></div>
                            ))
                        })
                    }
                </div>
                <Context.Provider
                    value={{
                        columns: this.sortedColumns,
                        data: this.data,
                        flattenSortedColumns: this.flattenSortedColumns,
                        ...this.contextAPI
                    }}
                >
                    {this.props.children}
                </Context.Provider>
                {
                    this.isInit && this.isPaging && data.length > 0 &&
                    <Pagination
                        isFirstPage={this.pageNo === 1}
                        isLastPage={this.pageNo === Math.ceil(this.total / this.pageSize)}
                        pageNo={this.pageNo}
                        onGoToPage={this.onGoToPage}
                        pageSize={this.pageSize}
                        setPageSize={this.setPageSize}
                        total={this.total}
                        pageSizeOptions={pageSizeOptions}
                    />
                }
                {
                    Loading ?
                        typeof Loading === 'function'
                            ? <Loading />
                            : <div style={loadingLayout}>{Loading === true ? <span>loading...</span> : Loading}</div>
                        : null
                }
            </div>
        )
    }
}

function sortColumns(columns) {
    const leftColumns = columns.filter(c => c.fix === 'left')
    const normalColumns = columns.filter(c => !c.fix)
    const rightColumns = columns.filter(c => c.fix === 'right').reverse()
    const r = [].concat(leftColumns).concat(normalColumns).concat(rightColumns)

    createLeafColumnIndex(r)
    return r
}

function createLeafColumnIndex(columns) {
    forEachLeafColumn(columns, (col, i, isLast) => {
        col.isFirst = i === 0
        col.isLast = isLast
        col.isLeaf = true
        col.leafIndex = i
    })
}

function syncWidthAndHeight(table, columns, rowHeight = -1, dimensionInfo, resizedWidthInfo, re) {
    // console.log(`columns`,columns)
    const columnSize = columns.length
    const findDOM = find.bind(null, table)
    const rootWidth = table.offsetWidth

    // header
    const [headerWrapper, headerRoot, header] = findDOM('header')
    const [leftHeaderWrapper, leftHeaderRoot, leftHeader] = findDOM('header', 'left')
    const [rightHeaderWrapper, rightHeaderRoot, rightHeader] = findDOM('header', 'right')

    // body
    const [bodyWrapper, bodyRoot, body] = findDOM('body')
    const [leftBodyWrapper, leftBodyRoot, leftBody] = findDOM('body', 'left')
    const [rightBodyWrapper, rightBodyRoot, rightBody] = findDOM('body', 'right')


    // remove column width
    removeColgroup(headerRoot)
    removeColgroup(leftHeaderRoot)
    removeColgroup(rightHeaderRoot)
    removeColgroup(bodyRoot)
    removeColgroup(leftBodyRoot)
    removeColgroup(rightBodyRoot)

    // comment out - removing height will cause scrollbar jumping
    // remove height
    // removeHeight(header)
    // removeHeight(leftHeader)
    // removeHeight(rightHeader)
    // removeHeight(body)
    // removeHeight(leftBody)
    // removeHeight(rightBody)


    // for sync width
    const headerWidthArray = widthArray(header, columnSize, 'end')
    const leftHeaderWidthArray = widthArray(leftHeader, columnSize, 'end')
    const rightHeaderWidthArray = widthArray(rightHeader, columnSize, 'start')
    const bodyWidthArray = widthArray(body, columnSize)
    const leftBodyWidthArray = widthArray(leftBody, columnSize, 'end')
    const rightBodyWidthArray = widthArray(rightBody, columnSize, 'start')
    const columnWidthArray = columns.map(c => c.width || 0)
    const resizedWidthArray = columns.map(c => resizedWidthInfo.get(c.metaKey) || -1)

    const originalMaxWidthArray = max(
        headerWidthArray,
        leftHeaderWidthArray,
        rightHeaderWidthArray,
        bodyWidthArray,
        leftBodyWidthArray,
        rightBodyWidthArray,
        columnWidthArray
    )

    let maxWidthArray = max(
        originalMaxWidthArray,
        resizedWidthArray
    )
    let sum = maxWidthArray.reduce((prev, curr) => prev + curr, 0)
    const leftOver = rootWidth - sum - 2 // exclude root border
    if (leftOver > 0) {
        const len = maxWidthArray.length
        maxWidthArray[len - 1] += leftOver
        sum += leftOver
    }

    const tableWidth = sum + 1 // thead/tbody width tends to be 1px less than table's
    const mergeMax = (w, i) => w > -1 ? maxWidthArray[i] : w
    const greaterThanInitial = w => w > -1

    const headerColgroup = createColgroup(maxWidthArray)
    const leftHeaderColgroup = createColgroup(leftHeaderWidthArray.map(mergeMax).filter(greaterThanInitial))
    const rightHeaderColgroup = createColgroup(rightHeaderWidthArray.map(mergeMax).filter(greaterThanInitial))

    const bodyColgroup = createColgroup(maxWidthArray)
    const leftBodyColgroup = createColgroup(leftBodyWidthArray.map(mergeMax).filter(greaterThanInitial))
    const rightBodyColgroup = createColgroup(rightBodyWidthArray.map(mergeMax).filter(greaterThanInitial))



    // sync width
    setStyle(headerRoot, 'minWidth', `${tableWidth}px`)
    setStyle(leftHeaderRoot, 'minWidth', `${tableWidth}px`)
    setStyle(rightHeaderRoot, 'minWidth', `${tableWidth}px`)
    setStyle(bodyRoot, 'minWidth', `${tableWidth}px`)


    appendChild(headerRoot, headerColgroup)
    appendChild(leftHeaderRoot, leftHeaderColgroup)
    appendChild(rightHeaderRoot, rightHeaderColgroup)
    appendChild(bodyRoot, bodyColgroup)
    appendChild(leftBodyRoot, leftBodyColgroup)
    appendChild(rightBodyRoot, rightBodyColgroup)



    // for sync height - should happen after width is synced
    const headerHeightArray = heightArray(header)
    const leftHeaderHeightArray = heightArray(leftHeader)
    const rightHeaderHeightArray = heightArray(rightHeader)
    const maxHeaderHeightArray = max(headerHeightArray, leftHeaderHeightArray, rightHeaderHeightArray)

    const bodyHeightArray = heightArray(body)
    const leftBodyHeightArray = heightArray(leftBody)
    const rightBodyHeightArray = heightArray(rightBody)
    const maxBodyHeightArray = max(bodyHeightArray, leftBodyHeightArray, rightBodyHeightArray)


    // sync height
    const headers = getChildren(header)
    const leftHeaders = getChildren(leftHeader)
    const rightHeaders = getChildren(rightHeader)
    const rows = getChildren(body)
    const leftRows = getChildren(leftBody)
    const rightRows = getChildren(rightBody)

    for (let i = 0, len = maxHeaderHeightArray.length; i < len; i++) {
        headers[i].style['height'] = `${maxHeaderHeightArray[i]}px`
        leftHeaders[i].style['height'] = `${maxHeaderHeightArray[i]}px`
        rightHeaders[i].style['height'] = `${maxHeaderHeightArray[i]}px`
    }

    // if(re) return

    for (let i = 0, len = maxBodyHeightArray.length; i < len; i++) {
        const height = Math.max(maxBodyHeightArray[i], rowHeight)
        rows[i].style['height'] = `${height}px` // jumping
        leftRows[i].style['height'] = `${height}px`
        rightRows[i].style['height'] = `${height}px`
    }

    // if(re) return
    // if body scroll vertically
    if (bodyRoot && bodyRoot.offsetHeight > bodyRoot.parentElement.offsetHeight) {
        syncHeaderBodyVerticalScrollStatus(headerRoot, true /* scroll */)
        hideVerticalScrollBarOfFixBody(leftBodyRoot, true /* scroll */)
        hideVerticalScrollBarOfFixBody(rightBodyRoot, true /* scroll */)
    } else {
        syncHeaderBodyVerticalScrollStatus(headerRoot, false /* scroll */)
        hideVerticalScrollBarOfFixBody(leftBodyRoot, false /* scroll */)
        hideVerticalScrollBarOfFixBody(rightBodyRoot, false /* scroll */)
    }

    // if body scroll horizontally
    if (bodyRoot && bodyRoot.offsetWidth > bodyRoot.parentElement.offsetWidth) {
        hideHorizontalScrollBarOfFixBody(leftBodyRoot, true /* scroll */)
        hideHorizontalScrollBarOfFixBody(rightBodyRoot, true /* scroll */)

        syncBodyHorizontalScrollStatus(leftBodyRoot, true /* scroll */)
        syncBodyHorizontalScrollStatus(rightBodyRoot, true /* scroll */)
    } else {
        hideHorizontalScrollBarOfFixBody(leftBodyRoot, false /* scroll */)
        hideHorizontalScrollBarOfFixBody(rightBodyRoot, false /* scroll */)

        syncBodyHorizontalScrollStatus(leftBodyRoot, false /* scroll */)
        syncBodyHorizontalScrollStatus(rightBodyRoot, false /* scroll */)
    }

    dimensionInfo.maxWidthArray = maxWidthArray
    dimensionInfo.maxHeaderHeightArray = maxHeaderHeightArray
    dimensionInfo.maxBodyHeightArray = maxBodyHeightArray
    dimensionInfo.originalMaxWidthArray = originalMaxWidthArray
}

function isDimensionChanged(table, columnSize, dimensionInfo) {
    const findDOM = find.bind(null, table)
    // header
    const [headerWrapper, headerRoot, header] = findDOM('header')
    const [leftHeaderWrapper, leftHeaderRoot, leftHeader] = findDOM('header', 'left')
    const [rightHeaderWrapper, rightHeaderRoot, rightHeader] = findDOM('header', 'right')

    // body
    const [bodyWrapper, bodyRoot, body] = findDOM('body')
    const [leftBodyWrapper, leftBodyRoot, leftBody] = findDOM('body', 'left')
    const [rightBodyWrapper, rightBodyRoot, rightBody] = findDOM('body', 'right')

    const headerWidthArray = widthArray(header, columnSize, 'end', 'debug')
    // console.log(`headerWidthArray`,headerWidthArray)
    const leftHeaderWidthArray = widthArray(leftHeader, columnSize, 'end')
    const rightHeaderWidthArray = widthArray(rightHeader, columnSize, 'start')
    const bodyWidthArray = widthArray(body, columnSize)
    const leftBodyWidthArray = widthArray(leftBody, columnSize, 'end')
    const rightBodyWidthArray = widthArray(rightBody, columnSize, 'start')

    const maxWidthArray = max(
        headerWidthArray,
        leftHeaderWidthArray,
        rightHeaderWidthArray,
        bodyWidthArray,
        leftBodyWidthArray,
        rightBodyWidthArray
    )

    // console.log(`headerArray`,headerWidthArray)
    // console.log(`headerArray`,headerWidthArray)

    const headerHeightArray = heightArray(header)
    const leftHeaderHeightArray = heightArray(leftHeader)
    const rightHeaderHeightArray = heightArray(rightHeader)
    const maxHeaderHeightArray = max(headerHeightArray, leftHeaderHeightArray, rightHeaderHeightArray)

    const bodyHeightArray = heightArray(body)
    const leftBodyHeightArray = heightArray(leftBody)
    const rightBodyHeightArray = heightArray(rightBody)
    const maxBodyHeightArray = max(bodyHeightArray, leftBodyHeightArray, rightBodyHeightArray)

    return isArrayChange(dimensionInfo.maxWidthArray, maxWidthArray)
        || isArrayChange(dimensionInfo.maxHeaderHeightArray, maxHeaderHeightArray)
        || isArrayChange(dimensionInfo.maxBodyHeightArray, maxBodyHeightArray)
}

function widthArray(element, requiredLen, startOrend = 'end') {
    let child = element && element.firstElementChild
    let rowIndex = 0, placeholder = -1, matrix = [], result = [], n = 0
    const rowOf = index => matrix[index] || (matrix[index] = [])
    const getColIndex = (array, i = 0) => {
        while (array[i] !== undefined) { i++ }
        return i
    }
    let next = true
    while (next) {
        const array = child ? child.children : []
        for (let i = 0, len = array.length; i < len; i++) {
            const cell = array[i]
            let colSpan = cell.getAttribute('colspan') || 1
            let rowSpan = cell.getAttribute('rowspan') || 1
            colSpan = colSpan / 1
            rowSpan = rowSpan / 1
            const colIndex = getColIndex(rowOf(rowIndex))

            if (colSpan > 1) {
                n = 0
                while (n < colSpan) { rowOf(rowIndex)[colIndex + n++] = placeholder }
                continue
            }

            const width = cell.offsetWidth
            rowOf(rowIndex)[colIndex] = width

            if (rowSpan > 1) {
                n = 0
                while (n < rowSpan) { rowOf(rowIndex + n++)[colIndex] = width }
                continue
            }
        }
        // console.log(`child`, padMatrix(matrix))
        matrix = padMatrix(matrix)
        result = matrix.length > 0 ? max.apply(null, matrix) : []
        const hasPlaceHolder = result.filter(i => i === placeholder).length > 0
        const hasNaN = result.filter(isNaN).length > 0

        if (result.length > 0 && (hasPlaceHolder || hasNaN)) {
            child = child.nextSibling
            rowIndex++
        } else {
            next = false
        }
    }

    return pad(result, requiredLen, startOrend, -1 /* pad With */)
}

function heightArray(element) {
    const r = [], array = (element && element.children) || []
    for (let i = 0, len = array.length; i < len; i++) {
        const height = array[i].offsetHeight
        r.push(height)
    }
    return r
}

function pad(array = [], requiredLen, startOrend = 'end', padWith) {
    const length = array.length
    if (length > requiredLen) throw `fail to pad array:${array}, its length exceeds the requiredLen: ${requiredLen}`
    if (length < requiredLen) {
        const pad = new Array(requiredLen - length)
        pad.fill(padWith, 0, pad.length)
        return startOrend === 'start' ? pad.concat(array) : [].concat(array).concat(pad)
    }
    return array
}

function padMatrix(matrix) {
    const maxLen = matrix.reduce((prev, curr) => Math.max(prev, curr.length), 0)
    return matrix.map(a => pad(a, maxLen, 'end'))
}

function removeColgroup(element) {
    const colgroup = element && element.getElementsByTagName('colgroup')[0]
    if (colgroup) {
        element.style.minWidth = 'unset'
        element.removeChild(colgroup)
    }
}

function removeHeight(element) {
    const array = (element && element.children) || []
    for (let i = 0, len = array.length; i < len; i++) {
        array[i].style.height = 'auto'
    }
}

function createColgroup(widthArray) {
    const colgroup = document.createElement('colgroup')
    for (let i = 0, len = widthArray.length; i < len; i++) {
        const width = widthArray[i]
        const col = document.createElement('col')
        col.setAttribute('width', `${width}px`)
        colgroup.appendChild(col)
    }
    return colgroup
}

function find(table, a, b) {
    const className = `swift-table-${a}${b ? '-' + b : ''}`
    const wrapper = table.getElementsByClassName(className)[0]
    const container = wrapper && wrapper.getElementsByTagName('table')[0]
    const content = container && container.getElementsByTagName(a === 'header' ? 'thead' : 'tbody')[0]
    return [wrapper, container, content]
}

/**
 * input:
 * [1, 4]
 * [3, 2]
 * output:
 * [3, 4]
 * 
 * @param  {...any} args 
 */
function max(...args) {
    const r = [],
        len = args[0].length,
        lenMatch = args.every(a => a.length === len),
        maxReducer = (prev, curr) => Math.max(prev, curr)
    if (!lenMatch) throw 'lenght not match'
    for (let i = 0; i < len; i++) {
        const col = args.map(a => a[i])
        r.push(col.reduce(maxReducer))
    }
    return r
}

function getChildren(element) {
    return element ? element.children : []
}

function setStyle(element, key, value) {
    element ? element.style[key] = value : undefined
}

function appendChild(element, child) {
    element ? element.appendChild(child) : undefined
}

function hideHorizontalScrollBarOfFixBody(bodyRoot, scroll = false) {
    if (scroll) {
        bodyRoot ? bodyRoot.parentElement.style.height = 'calc(100% + 15px)' : undefined
        bodyRoot ? bodyRoot.parentElement.parentElement.style.height = 'calc(100% - 15px)' : undefined
    } else {
        bodyRoot ? bodyRoot.parentElement.style.height = '100%' : undefined
        bodyRoot ? bodyRoot.parentElement.parentElement.style.height = '100%' : undefined
    }

}

function hideVerticalScrollBarOfFixBody(bodyRoot, scroll = false) {
    if (scroll) {
        bodyRoot ? bodyRoot.parentElement.parentElement.style.marginRight = '15px' : undefined
        bodyRoot ? bodyRoot.parentElement.style.marginRight = '-15px' : undefined
    } else {
        bodyRoot ? bodyRoot.parentElement.parentElement.style.marginRight = '0' : undefined
        bodyRoot ? bodyRoot.parentElement.style.marginRight = '0' : undefined
    }
}

function syncHeaderBodyVerticalScrollStatus(headerRoot, scroll = false) {
    if (scroll) {
        headerRoot ? headerRoot.parentElement.parentElement.style.overflowY = 'scroll' : undefined
    } else {
        headerRoot ? headerRoot.parentElement.parentElement.style.overflowY = 'hidden' : undefined
    }
}

function syncBodyHorizontalScrollStatus(bodyRoot, scroll = false) {
    if (scroll) {
        bodyRoot ? bodyRoot.parentElement.style.overflowX = 'scroll' : undefined
    } else {
        bodyRoot ? bodyRoot.parentElement.style.overflowX = 'hidden' : undefined
    }
}

function isArrayChange(a, b) {
    const len = a.length, length = b.length
    if (len !== length) return true
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) return true
    }
    return false
}
