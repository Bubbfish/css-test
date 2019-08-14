// 视图管理
import cmvCiRltClass from 'common/js/cmv/ciRltClass'
import ciClassUtils from 'common/js/cmv/ciClass'
import SwitchLineState from 'common/js/draw/switchLineState'
import { saveOrUpdate, queryFriendByDef } from 'api/ciRlt'
import {
  getEventListByCiCodes,
  getEventHistoryByCiCodes,
  queryRelatedDiagramEventByDiagramId
} from 'api/event'
import MountCiDraw from 'common/js/draw/mountCiDraw'
import {
  saveOrUpdateDiagram,
  queryDiagramInfoById,
  xml2Json,
  queryList,
  saveViewLocation
} from 'api/diagram'
import {
  parseInnerText,
  deepCopy,
  getHashParam,
  changeTimeFormat,
  unescapeHTML
} from '../util'
import store from '@/store'
import { saveDiagramVersion } from 'api/diagramVersion'
import { queryImagesByNames } from 'api/image'
import ciUtil from 'common/js/cmv/ci'
import ciRltUtils from 'common/js/cmv/ciRlt'
import { queryCurrentPerformancesByCiCodes } from 'api/metrics'
import L from 'common/js/i18n'
import getDiagramJson from 'common/js/diagram/getDiagramJson'
import interfacesUtil from 'common/js/diagram/interfacesUtil'
import { drawingContainRlt } from './action'
import { getQueryString } from 'common/js/util'
// import { linkType, linkArrow } from 'components/module/right/linkImageUrl.js'
const sysConfig = window.SYS_CONFIG
export default class DiagramManager {
  constructor(diagram) {
    this.diagram = diagram
  }
  save(diagranInfo, sheetInfo, tags, teamId) {
    if (this.diagram.isReadOnly) return
    this.diagram.resetOpacity()
    this.cleanTradPortEffect()
    let diagramBgImg = this.diagram.model.modelData.backgroundImage
    let diagramBgCss = this.diagram.model.modelData.backgroundColor
    let promise = new Promise((resolve, reject) => {
      // 保存时保存分类附加属性
      this.diagram.action.getDispToCell(this.diagram).then(() => {
        // 设置性能展示部分的筛选设置数据
        const helper = this.diagram.kpiSelectedDataHelper
        if (helper) {
          if (helper.setModelDataFromVm) helper.setModelDataFromVm()
          else if (helper.setModelDataFromTemp) helper.setModelDataFromTemp()
        }
        let json = this.getSheetJson(sheetInfo)
        let thumbnail = this.diagram.getThumbnail()
        let ci3dpoint =
          '{"graphWidth":0,"graphHeight":0,"nodes":[],"containers":[],"edges":[]}'
        ci3dpoint = JSON.stringify(getDiagramJson(this.diagram))
        let diagram = {
          diagramDesc: '',
          diagramType: 1,
          dirId: 0,
          dirType: 1,
          isOpen: 0,
          name: '',
          icon1: '',
          status: 1,
          diagramBgImg: '',
          diagramBgCss: 'transparent'
        }
        if (diagranInfo) {
          diagram = Object.assign(diagram, diagranInfo)
        }
        if (diagramBgImg) {
          diagram.diagramBgImg = diagramBgImg
        } else {
          diagram.diagramBgImg = ''
        }
        if (diagramBgCss) {
          diagram.diagramBgCss = diagramBgCss
        } else {
          diagram.diagramBgCss = 'transparent'
        }
        // 添加告警和下钻视图信息
        let diagramEles = this.getDiagramEles(sheetInfo)
        // 如果是展示视图则把位置信息存起来
        if (!interfacesUtil.isDesignUnit()) {
          let jsonTmp = JSON.parse(json)
          let componentJson = jsonTmp.sheetlist.pop()
          if (componentJson && (componentJson.diagram.jumpId || componentJson.diagram.componentConnectId)) {
            let params = {}
            let ciStyle = {}
            let nodeDataArrayLocation = []
            let linkDataArrayLocation = []
            nodeDataArrayLocation = componentJson.nodeDataArray.map(node => {
              return {
                ciCode: node.ciCode,
                location: node.loc,
                interfaces: node.interfaces
              }
            })
            linkDataArrayLocation = componentJson.linkDataArray.map(link => {
              if (link.ciRlt) {
                return {
                  ciCode: link.ciRlt.ciCode,
                  location: link.points,
                  visible: link.visible
                }
              }
            })
            ciStyle = {nodeDataArrayLocation, linkDataArrayLocation}
            ciStyle = JSON.stringify(ciStyle)
            params = {
              ciCode: componentJson.diagram.ciCode,
              ciStyle
            }
            if (componentJson.diagram.localId) {
              params.id = componentJson.diagram.localId
            }
            // 保存关系
            saveViewLocation(params)
          }
        }
        // 展示视图只保存一个json
        if (!interfacesUtil.isDesignUnit()) {
          let jsonTmp = JSON.parse(json)
          let json1 = jsonTmp.sheetlist.shift()
          json1.active = true
          jsonTmp.sheetlist = []
          jsonTmp.sheetlist.push(json1)
          json = JSON.stringify(jsonTmp)
        }

        let params = {
          ci3dpoint,
          diagram,
          diagramEles,
          thumbnail,
          json
        }
        if (!diagranInfo) {
          params.autoName = true
        }
        if (tags && tags.length) {
          params.tags = tags
        }
        if (teamId) {
          params.createGroupId = teamId
        }
        saveOrUpdateDiagram(params).then(res => {
          if (res.success && res.data) {
            // 更新下钻视图的json
            if (tags) {
              let diagramSheet = deepCopy(store.getters.diagramSheet)
              diagramSheet.forEach(item => {
                if (item.active) {
                  if (item.combDiagramInfos) {
                    item.combDiagramInfos.forEach(item2 => {
                      delete item2.isModified
                      if (item2.diagram.id === res.data) {
                        sheetInfo.json.forEach(list => {
                          if (list.visibleBak) {
                            list.isVisible = list.visibleBak
                            delete list.visibleBak
                          }
                        })
                        item2.json = sheetInfo.json
                      }
                    })
                  } else {
                    delete item.isModified
                    sheetInfo.json.forEach(list => {
                      if (list.visibleBak) {
                        list.isVisible = list.visibleBak
                        delete list.visibleBak
                      }
                    })
                    item.json = sheetInfo.json
                  }
                }
              })
              store.commit('SET_DIAGRAM_SHEET', diagramSheet)
              this.diagram.fireEvent('saveDiagram')
            }
            resolve(res)
            // 重新获取下钻试图告警
            // this.getRelatedDiagramEvent()
          } else {
            reject(res)
          }
        })
      })
    })
    return promise
  }
  getSheetJson(sheetInfo) {
    let { json, tree } = sheetInfo
    let index = ''
    let sheetlist = json
    let currentSheet = null
    if (!sheetlist) {
      sheetlist = sheetInfo.sheetlist ? sheetInfo.sheetlist : sheetInfo
    }
    sheetlist.forEach((item, i) => {
      if (item.isVisible) item.visibleBak = item.isVisible
      delete item.isVisible
      if (item.active === true) {
        index = i
        currentSheet = item
      }
    })
    let model = this.diagram.getSaveModel()
    model.active = currentSheet.active
    model.diagram = currentSheet.diagram
    sheetlist[index] = model
    if (!tree || !tree.length) {
      tree = this.getCreateTree(sheetlist)
    }
    const obj = JSON.stringify({ sheetlist, tree })
    return obj
  }
  // 所有 sheet 页CI过滤保存告警信息和获取钻取信息
  getDiagramEles(sheetInfo) {
    let rltViews = new Set()
    let { json } = sheetInfo
    let sheetlist = json
    if (!sheetlist) {
      sheetlist = sheetInfo.sheetlist ? sheetInfo.sheetlist : sheetInfo
    }
    let diagramNode = []
    let sheetName
    let diagramLink = []
    let diagramEles
    sheetlist.forEach(item => {
      sheetName = item.diagram.name
      item.nodeDataArray.forEach(node => {
        if (node.ciCode) {
          diagramNode.push({ciId: node.ciId, type: 1, ciCode: node.ciCode, ciVersion: node.ciVersion, sheetName})
          // 添加接口CI
          let interfaces = this.diagram.getNodeAllInterfaceData(node)
          if (interfaces.length) {
            interfaces.forEach(item => {
              if (item.ciId) {
                diagramNode.push({ciId: item.ciId, type: 1, ciCode: item.ciCode, ciVersion: item.ciVersion, sheetName})
              }
            })
          }
        }
        if (node.rltViews && node.rltViews.length > 0) {
          node.rltViews.forEach(view => {
            if (typeof view === 'object') {
              rltViews.add(view.id)
            } else if (typeof view === 'string') {
              rltViews.add(view)
            }
          })
        }
      })
      if (Array.isArray(item.linkDataArray)) {
        item.linkDataArray.forEach(link => {
          if (link.ciRlt) {
            diagramLink.push({
              ciId: link.rltId,
              type: 4,
              ciCode: link.ciRlt.ciCode,
              ciVersion: link.ciRlt.version,
              sheetName,
              eleCode: link.ciRlt.ciCode || (link.ciRlt.sourceCiCode + '_' + link.ciRlt.classId + '_' + link.ciRlt.targetCiCode)
            })
          }
        })
      }
    })
    diagramNode = diagramNode.concat(diagramLink)
    let setDiagramNode = Array.from(new Set(diagramNode))
    diagramEles = setDiagramNode.map(item => {
      let json = {
        eleId: item.ciId,
        eleType: item.type,
        eleCode: item.ciCode ? item.ciCode : (item.eleCode || ''),
        eleVersion: item.ciVersion ? item.ciVersion : 1,
        sheetName: item.sheetName
      }
      return json
    })
    // let diagramLink = []
    // if (Array.isArray(this.diagram.model.linkDataArray)) {
    //   this.diagram.model.linkDataArray.forEach(link => {
    //     if (link.ciRlt) {
    //       diagramLink.push({
    //         ciId: link.ciRlt.id,
    //         type: 4,
    //         ciCode: link.ciRlt.ciCode,
    //         ciVersion: link.ciRlt.version,
    //         sheetName,
    //         eleCode: link.ciRlt.ciCode || (link.ciRlt.sourceCiCode + '_' + link.ciRlt.classId + '_' + link.ciRlt.targetCiCode)
    //       })
    //     }
    //   })
    // }
    // diagramNode = diagramNode.concat(diagramLink)
    // let setDiagramNode = Array.from(new Set(diagramNode))
    // let diagramEles = setDiagramNode.map(item => {
    //   let json = {
    //     eleId: item.ciId,
    //     eleType: item.type,
    //     eleCode: item.ciCode ? item.ciCode : '',
    //     eleVersion: item.ciVersion ? item.ciVersion : 1,
    //     sheetName: item.sheetName
    //   }
    //   return json
    // })
    if (rltViews.size) {
      let rltDiagramIds = ''
      rltViews.forEach(view => {
        rltDiagramIds += view + ','
      })
      let relatedJson = {
        eleType: 7,
        rltDiagramIds: rltDiagramIds.substr(0, rltDiagramIds.length - 1)
      }
      diagramEles.push(relatedJson)
    }
    return diagramEles
  }
  saveVersion(obj, sheetInfo) {
    let promise = new Promise((resolve, reject) => {
      let thumbnail = this.diagram.getThumbnail()
      let ci3dpoint =
        '{"graphWidth":0,"graphHeight":0,"nodes":[],"containers":[],"edges":[]}'
      let json = this.getSheetJson(sheetInfo)
      let diagramEles = this.getDiagramEles(sheetInfo)
      let updateType = 3
      let versionDesc = ''
      let params = {
        ci3dpoint,
        diagramEles,
        thumbnail,
        json,
        updateType,
        versionDesc
      }
      params = Object.assign(params, obj)
      saveDiagramVersion(params).then(res => {
        if (res.success && res.data) {
          resolve(res)
        } else {
          reject(res)
        }
      })
    })
    return promise
  }
  // 根据ID获取视图信息
  getDiagramInfo(diagramId, index = 0, openDiagram = true) {
    let promise = new Promise((resolve, reject) => {
      queryDiagramInfoById({
        id: String(diagramId),
        retEles: false
      }).then(resultAll => {
        ciUtil.getCiInfoByOrdId(diagramId).then(result => {
          let sheetJosn = JSON.parse(resultAll.data.json)
          result.forEach(currentCi => {
            if (sheetJosn.sheetlist) {
              sheetJosn.sheetlist.forEach(item => {
                if (item.modelData && item.modelData.privateLib) {
                  item.modelData.privateLib.forEach(ci => {
                    if (ci.ciCode === currentCi.ci.ciCode) {
                      ci.ciId = currentCi.ci.id
                      ci.ciVersion = currentCi.ci.ciVersion
                    }
                  })
                }
                if (item.nodeDataArray) {
                  item.nodeDataArray.forEach(ci => {
                    if (ci.ciCode === currentCi.ci.ciCode) {
                      ci.ciId = currentCi.ci.id
                      ci.ciVersion = currentCi.ci.ciVersion
                    }
                    // 变更后的libType全部变成1
                    if (resultAll.data.taskRepresentation) {
                      if (resultAll.data.taskRepresentation.taskKey === 'change') {
                        if (ci.libType) {
                          ci.libType = 1
                        }
                      }
                    }
                    // if (ci.libType)
                    ['left', 'top', 'right', 'bottom'].forEach(item => {
                      if (ci.interfaces) {
                        if (ci.interfaces[item].length > 0) {
                          ci.interfaces[item].forEach(item => {
                            if (item.ciCode === currentCi.ci.ciCode) {
                              item.ciId = currentCi.ci.id
                              item.ciVersion = currentCi.ci.ciVersion
                              item.attrs = currentCi.attrs
                              item.ciClass = currentCi.ciClass
                            }
                          })
                        }
                      }
                    })
                  })
                }
              })
            }
          })
          let sheetActive = sheetJosn.sheetlist.find(item => item.active)
          let ciInfoParams = []
          let nodeDataArray = sheetActive.nodeDataArray
          nodeDataArray.forEach(cell => {
            if (cell.ciCode) {
              ciInfoParams.push({
                ciCode: cell.ciCode,
                ciVersion: cell.ciVersion,
                ciId: cell.ciId
              })
            }
          })

          nodeDataArray.forEach(node => {
            if (typeof node.interfaces === 'object') {
              let directions = Object.keys(node.interfaces)
              directions.forEach(item => {
                let list = node.interfaces[item]
                if (Array.isArray(list)) {
                  let ciCodes = list.map(item => {
                    return {
                      ciCode: item.ciCode,
                      ciVersion: item.ciVersion,
                      ciId: item.ciId
                    }
                  })
                  ciInfoParams = ciInfoParams.concat(ciCodes)
                }
              })
            }
          })
          ciRltUtils.queryCiRltList(ciInfoParams, 1).then(res => {
            res.forEach(currentCi => {
              if (sheetJosn.sheetlist) {
                sheetJosn.sheetlist.forEach(item => {
                  if (item.diagram.ciCode) {
                    if (item.diagram.ciCode === currentCi.ciRlt.ciCode) {
                      item.diagram.componentConnectId = currentCi.ciRlt.id
                    }
                  }
                  if (item.linkDataArray) {
                    item.linkDataArray.forEach(ci => {
                      if (ci.ciRlt && ci.ciRlt.ciCode === currentCi.ciRlt.ciCode) {
                        ci.ciRlt.id = currentCi.ciRlt.id
                        ci.version = currentCi.ciRlt.version
                      }
                      // 变更后的libType全部变成1
                      if (resultAll.data.taskRepresentation) {
                        if (resultAll.data.taskRepresentation.taskKey === 'change') {
                          if (ci.ciRlt.rltLibType) {
                            ci.ciRlt.rltLibType = 1
                          }
                        }
                      }
                    })
                  }
                  if (item.modelData && item.modelData.privateLib) {
                    item.modelData.privateLib.forEach(ci => {
                      if (ci.sourceCiCode === currentCi.ciRlt.sourceCiCode && ci.targetCiCode === currentCi.ciRlt.targetCiCode) {
                        ci.rltId = currentCi.ciRlt.id
                      }
                    })
                  }
                })
              }
            })
            resultAll.data.json = JSON.stringify(sheetJosn)
            if (resultAll && typeof resultAll.data === 'object') {
              let diagramInfo = resultAll.data
              delete diagramInfo.ci3dPoint
              let { combDiagramInfos } = diagramInfo
              let defaultIndex = 0
              if (
                Array.isArray(combDiagramInfos) &&
                index < combDiagramInfos.length &&
                index >= 0
              ) {
                defaultIndex = index
              }
              this.setDataFormat(diagramInfo, defaultIndex).then(res => {
                let { sheetJson } = res
                if (openDiagram) {
                  this.openDiagramJson(JSON.stringify(sheetJson))
                  resolve(diagramInfo)
                } else {
                  resolve(diagramInfo)
                }
              })
            } else {
              reject(new Error(L.get('COMMON_VIEW_DATA_EXCEPTION', null)))
            }
          })
        })
      }, (err) => {
        if (err) {
          console.log(err)
        }
      })
    })
    return promise
  }
  // 对组合视图和单个视图的数据进行格式化处理，使其数据方便 sheet 页
  setDataFormat(diagramInfo, index = 0) {
    let combDiagramInfos = diagramInfo.combDiagramInfos
    let diagramSheet = combDiagramInfos ? combDiagramInfos[index] : diagramInfo
    let sheetInfo = null
    let sheetName = L.get('COMMON_VIEW') + ' 1'
    let sheetJson = {}
    let promise = new Promise((resolve, reject) => {
      // 对只有 xml 格式的视图转换成 json 数据
      // 并且有该格式的数据都转成单个 sheet 页的json 数组
      if (!diagramSheet.json) {
        this.parseXml2Json(diagramSheet.xml)
          .then(data => {
            sheetJson = data
            sheetJson.active = true
            sheetJson.diagram = {}
            sheetJson.diagram.name = sheetName
            diagramSheet.json = [sheetJson]
            delete diagramSheet.xml
            delete diagramSheet.ci3dPoint
            if (combDiagramInfos) delete diagramInfo.xml
            resolve({ sheetJson, diagramSheet })
          })
          .catch(() => {
            reject(new Error(L.get('COMMON_VIEW_DATA_EXCEPTION', null)))
          })
      } else {
        // 对 json 数据进行解压后可能得到json 数组或单个对象
        // 在 json 数组中找到上一次打开的视图(active 为 true)
        // 如果是单个对象则包装为数组默认打开,sheet 页名称按视图名称命名
        if (typeof diagramSheet.json === 'string') {
          // console.log(diagramSheet.json)
          sheetInfo = JSON.parse(diagramSheet.json)
        } else {
          sheetInfo = diagramSheet.json
        }
        if (sheetInfo instanceof Array) {
          sheetInfo.forEach(item => {
            if (item.active) {
              sheetJson = item
            }
          })
          diagramSheet.json = sheetInfo
          diagramSheet.tree = this.getCreateTree(sheetInfo)
        } else {
          const { sheetlist, tree } = sheetInfo
          if (sheetlist) {
            sheetlist.forEach(item => {
              if (item.active) {
                sheetJson = item
              }
            })
          } else {
            sheetJson = sheetInfo
            sheetJson.active = true
            sheetJson.diagram = {}
            sheetJson.diagram.name = sheetName
          }
          let sheet = sheetlist || [sheetJson]
          diagramSheet.json = sheet
          diagramSheet.tree = tree || this.getCreateTree(sheet)
        }
        resolve({ sheetJson, diagramSheet })
      }
    })
    return promise
  }
  getCreateTree(sheet) {
    const tree = { name: '设计单元', children: [] }
    sheet.forEach(item => {
      tree.children.push({
        name: item.diagram.name,
        id: item.diagram.id,
        diagramType: 1,
        children: []
      })
    })
    const children = [tree]
    return children
  }
  /**
   * 拖入容器创建关系
   *
   * @param {*} selection 目标节点
   * @param {*} grp 源节点
   * @param {*} rltType 关系类型
   * @memberof DiagramManager
   */
  createRltGroup(selection, grp, rltType) {
    if (grp.ciId && selection.ciId && selection.ciClass && grp.ciClass) {
      let classIds = [selection.ciClass.id, grp.ciClass.id]
      let rltClassList = store.getters.rltClassList
      let rltInfo = ciClassUtils.getRltInfoBetweenCiClass(classIds[0], classIds[1]) // 查询CI分类间关系(区分源和目标)
      let rltInfo1 = ciClassUtils.getRltInfoBetweenCiClass(classIds[1], classIds[0]) // 查询CI分类间关系(区分源和目标)
      rltInfo = rltInfo.concat(rltInfo1)
      let rltClass
      // 不存在分类间关系再走写死的配置
      if (rltInfo.length) {
        rltClass = rltInfo[0].rltClassInfo.ciClass
      } else {
        let selectionClassName = selection.ciClass.className
        let groupClassName = grp.ciClass.className
        let filterClassCode = selectionClassName.substr(selectionClassName.length - 2)
        let filterClassCodeF = selectionClassName.substr(selectionClassName.length - 4)
        if (!rltType) {
          if (groupClassName === '应用系统' && (filterClassCode === '组件' || filterClassCodeF === '组件实例')) {
            rltType = '包含'
          } else if (groupClassName === '节点' && filterClassCodeF === '组件实例') {
            rltType = '部署在'
            // 交换参数
            let temp = selection
            selection = grp
            grp = temp
          }
        }
        rltClassList.find(el => {
          if (el.ciClass.className === rltType) {
            rltClass = el.ciClass
            return true
          }
        })
      }
      if (!rltClass) return
      let hasRlt = false
      let ciCodes = [selection, grp]
      ciRltUtils.queryCiRltList(ciCodes, 1).then(res => {
        if (res.length > 0) {
          hasRlt = res.some(el => el.rltClassInfo.ciClass.classCode === rltClass.classCode)
        }
        if (!hasRlt) {
          setTimeout(() => {
            let params = {
              attrs: {},
              ciRlt: {},
              sourceCi: {},
              targetCi: {}
            }
            let targetCi = selection
            let sourceCi = grp
            let sourceCiCode = grp.ciCode
            let targetCiCode = selection.ciCode
            if (rltInfo.length) {
              if (grp.ciClass.id === rltInfo[0].ciClassRlt.targetClassId && selection.ciClass.id === rltInfo[0].ciClassRlt.sourceClassId) {
                targetCi = grp
                sourceCi = selection
              }
            }
            params.targetCi = {
              id: targetCi.ciId,
              classId: targetCi.ciClass.id,
              ciVersion: targetCi.ciVersion ? targetCi.ciVersion : 1,
              ciCode: targetCi.ciCode
            }
            params.sourceCi = {
              id: sourceCi.ciId,
              classId: sourceCi.ciClass.id,
              ciVersion: sourceCi.ciVersion ? sourceCi.ciVersion : 1,
              ciCode: sourceCi.ciCode
            }
            let ciRlt = {
              rltLibType: 1,
              version: 1,
              classId: rltClass.id
            }
            params.ciRlt = ciRlt
            saveOrUpdate(params).then(res => {
              if (res.success && res.data) {
                // 创建容器包含关系时创建隐藏的关系线
                let isContainRlt = ciRltUtils.isContainRlt(rltClass.id)
                if (isContainRlt) {
                  let ciRlt = {
                    classId: rltClass.id,
                    id: Number(res.data),
                    targetCiId: targetCi.ciId,
                    sourceCiId: sourceCi.ciId,
                    targetCiCode,
                    sourceCiCode
                  }
                  let oldSkips = this.diagram.skipsUndoManager
                  this.diagram.skipsUndoManager = true
                  let linkData = this.diagram.action.addRltLinkData(this.diagram, { ciRlt }, false)
                  if (linkData) {
                    this.diagram.model.setDataProperty(linkData, 'visible', false)
                  }
                  this.diagram.skipsUndoManager = oldSkips
                }
              }
            })
          }, 1000)
        }
      })
    }
  }
  // 根据ID批量获取视图基本信息
  getDiagramsInfoByIds(diagramIds) {
    let promise = new Promise((resolve, reject) => {
      queryList({
        cdt: {
          ids: diagramIds
        }
      }).then(res => {
        resolve(res)
      })
    })
    return promise
  }
  // 特殊处理视图中应用系统包含实例 并且 实例部署在节点上的
  formatOpenSheetJson(json) {
    let { nodeDataArray, linkDataArray } = json
    let ciClassList = store.getters.ciClassList
    let instMap = new Map()
    let instGroupMap = new Map()
    if (linkDataArray.length) {
      // 这是 部署实例 与 应用系统的包含
      linkDataArray.filter(item => {
        let targetCI = ciClassList.filter(itemCi => item.ciRlt && item.ciRlt.targetClassId === itemCi.ciClass.id)[0]
        let sourceCI = ciClassList.filter(itemCi => item.ciRlt && item.ciRlt.sourceClassId === itemCi.ciClass.id)[0]
        if (targetCI && sourceCI && item.rltClassName === '包含' && sourceCI.ciClass.className === '应用系统' && ~targetCI.ciClass.className.indexOf('实例')) {
          let linkData = linkDataArray.filter(link => link.from === item.to && link.rltClassName === '部署在')[0]
          if (linkData) {
            this.diagram.model.setDataProperty(item, 'visible', false)
            instMap.set(linkData.from, linkData.to) // 记录节点key
            instGroupMap.set(linkData.from + '_Group', item.from) // 记录应用系统 key
            return true
          }
        }
        return false
      }).forEach(item => {
        let nodeArr = nodeDataArray.map(node => {
          instMap.forEach((val, key) => {
            if (key === node.key) {
              node.group = val
            }
            if (val === node.key) {
              node.group = instGroupMap.get(key + '_Group')
            }
            linkDataArray.forEach(link => {
              if (link.from === key && link.rltClassName === '部署在') {
                link.visible = false
              }
            })
          })
          return node
        })
        nodeDataArray = nodeArr
      })
    }
    json.nodeDataArray = nodeDataArray
    json.linkDataArray = linkDataArray
    return JSON.stringify(json)
  }
  // 打开视图并执行视图数据更新等操作
  openDiagramJson(json) {
    let nJson = this.formatOpenSheetJson(JSON.parse(json))
    this.diagram.fireEvent('beforOpenDiagram')
    this.diagram.openDiagram(nJson)
    this.diagram.switchVisible = false
    setTimeout(() => {
      this.diagramCiLinkInit(() => {
        this.diagram.fireEvent('openInitDiagram')
      })
    })
    this.setBackgroundColor(nJson)
    // let mountCiDraw = new MountCiDraw({ diagram: this.diagram })
    // mountCiDraw.refreshDiagramMountCis() // return a promsie
    // this.getWork()
    // this.getEvent()
    // this.getPerformance()
    // 更新模板内容
    this.getTemplateInfo()
  }
  setBackgroundColor(json) {
    if (this.diagram.model.modelData.backgroundColor) return
    let sheet = null
    let info = null
    if (typeof json === 'string') {
      sheet = JSON.parse(json)
      info = sheet.diagram
    } else {
      info = json
    }
    let sheetType = []
    if (getHashParam('dirType') === 5 || getHashParam('dirType') === 6) {
      sheetType = sysConfig.SHOW_SHEET_CONFIG
    } else {
      sheetType = sysConfig.DESIGN_SHEET_CONFIG
    }
    if (info.type) {
      sheetType.some(item => {
        if (item.type === info.type) {
          this.diagram.div.style.backgroundColor = item.backgroundColor
          return true
        }
      })
    } else {
      this.diagram.div.style.backgroundColor = 'none'
    }
  }
  // 打开视图静态数据，不替换图标，临时使用
  openDiagramStaticJson(json) {
    this.diagram.openDiagram(json)
  }
  // 视图打开查询 CI 和关系信息并赋值
  diagramCiLinkInit(callback) {
    // 开图AvoidsNodes线性更改为Orthogonal防止线段位置变化
    if (this.diagram.links.count) {
      this.diagram.links.each(item => {
        if (item.routing === go.Link.AvoidsNodes) {
          item.routing = go.Link.Orthogonal
        }
      })
    }
    this.fetchCiAndRltInfo().then(result => {
      let promiseList = [this.repairNodesImage()]
      // 是否更新接口信息
      if (SYS_CONFIG.DIAGRAM_UPDATE_RELATED_INTERFACE && !interfacesUtil.isAlteration()) {
        promiseList.push(this.updateInterfaceInfo(result))
      }
      Promise.all(promiseList).then(() => {
        // 更新视图初始数据
        this.diagram.setOriginModel()
        callback && callback()
      })
    })
  }
  // 更新接口信息，更新接口代理属性
  updateInterfaceInfo(ciRltInfo) {
    return new Promise(resolve => {
      let ciCodes = []
      this.diagram.model.nodeDataArray.forEach(cell => {
        if (cell.ciCode && !cell.noData) {
          ciCodes.push(cell.ciCode)
        }
      })
      if (ciCodes.length) {
        interfacesUtil.updateCiInterfaceInfo(this.diagram, ciCodes).then(result => {
          // 更新映射接口代理属性
          let rltInfoList = ciRltInfo[1]
          if (rltInfoList && rltInfoList.length) {
            rltInfoList.forEach(rltInfo => {
              if (rltInfo.rltClassInfo && rltInfo.rltClassInfo.ciClass.className === SYS_CONFIG.CLUSTER_INTERFACE_CONFIG.rltClassName) {
                this.diagram.action.setInterfaceProxyInfo(this.diagram, rltInfo)
              }
            })
          }
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
  // 获取画布上的所有关系并自动连线
  getRelationAndDraw(ids) {
    if (!Array.isArray(ids)) {
      ids = this.diagram.getDiagramCiIds()
    }
    let showLogicalLinkAll = store.getters.themeConfig.showLogicalLinkAll
    // 转换逻辑链路
    let logicLink = this.diagram.model.modelData.logicLink
    if (typeof logicLink !== 'boolean') {
      logicLink = showLogicalLinkAll === '1'
    }
    let cisData = this.diagram.queryCiDataByCiIds(ids)
    let dirType = getQueryString('dirType')
    let ciLibType = this.diagram.queryLibTypeByCiId(ids[ids.length - 1])
    let libType = dirType === '2' ? -1 : ciLibType === 4 ? 3 : ciLibType // 基线库元素(4)查询关系libtype为3
    libType = dirType === '5' ? 2 : dirType === '6' ? 3 : libType
    let promise = new Promise((resolve, reject) => {
      if (ids.length >= 2) {
        ciRltUtils.queryCiRltList(cisData, libType).then(res => {
          let rltList = res
          // 关系线在私有库和设计库同时存在时过滤设计库的关系
          // 前端保存所有关系到私有库
          // this.diagram.fireEvent('queryAllRelDone', rltList)
          if (libType === -1) {
            rltList = res.filter(item => item.ciRlt.rltLibType === 1)
            if (!rltList.length) {
              rltList = res
            } else {
              res.forEach(item => {
                let rltLibType = item.ciRlt.rltLibType
                if (rltLibType === 2) {
                  let isInPrivate = rltList.find(i => item.ciRlt.ciCode === i.ciRlt.ciCode)
                  if (!isInPrivate) {
                    rltList.push(item)
                  }
                }
              })
            }
          }
          if (Array.isArray(rltList) && rltList.length) {
            let model = this.diagram.model
            let rltNameList = SYS_CONFIG.JUMPID_RLT_NAME_LIST
            if (Array.isArray(rltNameList)) {
              let isComponentConnectView = interfacesUtil.isComponentConnectView()
              let rltNames = []
              rltNameList.forEach(rltName => {
                if (rltName[0] === '!' && isComponentConnectView) {
                  rltNames.push(rltName.slice(1))
                } else if (!isComponentConnectView && rltName[0] !== '!') {
                  rltNames.push(rltName)
                }
              })
              rltList = rltList.filter(rlt => {
                return (rltNames.indexOf(rlt.rltClassInfo.ciClass.className) === -1)
              })
            }
            let drawLinkDataList = []
            let rltAuto = SYS_CONFIG.RLT_AUTO_ATTR
            this.diagram.startTransaction('addRltLink')
            rltList.forEach(rlt => {
              let link = this.diagram.getRltLinkDataByCiCode(rlt.ciRlt.ciCode)
              if (link) return // 存在相同ciCode的关系线时不绘制
              let fromKey = this.diagram.getNodeKeyByCiCode(rlt.ciRlt.sourceCiCode)
              let toKey = this.diagram.getNodeKeyByCiCode(rlt.ciRlt.targetCiCode)
              // 线条是容器类型的
              let bool = false
              const rltClass = cmvCiRltClass.getRltClassById(rlt.ciRlt.classId)
              if (rlt.rltClassInfo) {
                if (rltClass && rltClass.addAttrs && rltClass.addAttrs.lineType && rltClass.addAttrs.lineType.name === 'container') {
                  this.drawingContainer(rlt, rltClass.addAttrs.lineType)
                  bool = true
                  return
                } else if (rlt.rltClassInfo.ciClass.lineDispType === 2) {
                  this.drawingContainer(rlt)
                  bool = true
                  return
                }
              }
              if (!bool) {
                if (fromKey) {
                  let fromNode = this.diagram.model.findNodeDataForKey(fromKey)
                  if (fromNode.isGroup) return
                }
              }
              let fromPort, toPort
              if (!fromKey && !toKey) {
                let fromNode = this.diagram.findNodeDataByInterfaceCode(rlt.ciRlt.sourceCiCode)
                let toNode = this.diagram.findNodeDataByInterfaceCode(rlt.ciRlt.targetCiCode)
                if (fromNode && toNode) {
                  fromKey = fromNode.key
                  toKey = toNode.key
                  fromPort = String(rlt.ciRlt.sourceCiCode)
                  toPort = String(rlt.ciRlt.targetCiCode)
                } else {
                  return
                }
              }
              const ciRltClass = cmvCiRltClass.getRltClassById(rlt.ciRlt.classId)
              let labelObj = ciRltUtils.getCiRltLabel(rlt, ciRltClass, this.diagram.model.modelData.rltSelectAttrObj)
              let linkData = {
                from: fromKey,
                to: toKey,
                rltId: rlt.ciRlt.id,
                stroke: ciRltClass.ciClass.lineColor,
                strokeWidth: ciRltClass.ciClass.lineBorder,
                noArrow: ciRltClass.ciClass.lineDirect === 'none',
                label: labelObj.label,
                fromLabel: labelObj.fromLabel,
                toLabel: labelObj.toLabel,
                screeningHidden: !labelObj.visible,
                rltClass: rlt.rltClassInfo.ciClass,
                ciRlt: rlt.ciRlt,
                rltClassName: rlt.rltClassInfo.ciClass.className
              }
              if (rlt.ciRlt.rltLibType) {
                linkData.rltLibType = rlt.ciRlt.rltLibType
              }
              if (rlt.attrs && rlt.rltClassInfo && rlt.rltClassInfo.attrDefs) {
                let attrs = ciUtil.attrs2AttrDefs(rlt.attrs, rlt.rltClassInfo.attrDefs)
                linkData.attrs = attrs
              }
              if (fromPort && toPort) {
                linkData.category = 'interface'
                linkData.fromPort = fromPort
                linkData.toPort = toPort
              }
              for (let name in rltAuto) {
                if (
                  rltAuto.hasOwnProperty(name) &&
                  rlt.attrs &&
                  rlt.attrs[name]
                ) {
                  let int = Number(rlt.attrs[name])
                  let attrName = rltAuto[name]
                  linkData[attrName] = int
                }
              }
              // 隐藏映射连线
              if (linkData.rltClassName === SYS_CONFIG.CLUSTER_INTERFACE_CONFIG.rltClassName) {
                linkData.visible = false
              }
              this.diagram.action.setRltLinkClassStyle(this.diagram, linkData, rltClass)
              model.addLinkData(linkData)
              if (linkData.rltClassName === SYS_CONFIG.CLUSTER_INTERFACE_CONFIG.rltClassName) {
                this.diagram.action.setInterfaceProxyInfo(this.diagram, linkData)
              }
              drawLinkDataList.push(linkData)
              if (logicLink) {
                this.switchLineState = new SwitchLineState({
                  diagram: this.diagram,
                  selection: this.diagram.findLinkForData(linkData)
                })
                this.switchLineState.switchLogic()
              }
            })
            this.restoresContainer(model.nodeDataArray)
            // 遍历关系线 如果关系中有映射的关系那么就触发这个事件
            // for (let i = 0; i < drawLinkDataList.length; i++) {
            //   if (drawLinkDataList[i].rltClassName === SYS_CONFIG.CLUSTER_INTERFACE_CONFIG.rltClassName) {
            //     this.diagram.fireEvent('drawRelationLinkDone', drawLinkDataList)
            //     break
            //   }
            // }
            this.diagram.fireEvent('drawRelationLinkDone', drawLinkDataList)
            this.diagram.commitTransaction('addRltLink')
            resolve(drawLinkDataList)
          } else {
            resolve([])
          }
        })
      } else {
        resolve([])
      }
    })
    return promise
  }
  restoresContainer(list) {
    let length = list.length
    for (let i = 0; i < length; i += 1) {
      let item = list[i]
      if (item.category === 'group') {
        let children = this.diagram.getChildrenByGroupKey(item.key)
        if (children.length === 0) {
          if (item.ciCode && item.rltToContainer) {
            this.diagram.model.removeNodeData(item)
            item.category = 'image'
            item['isGroup'] = false
            this.diagram.model.addNodeData(item)
            i--
          }
        } else {
          this.restoresContainer(children)
        }
      }
    }
  }
  /**
   * @description 根据关系绘制对应容器
   * @param {*} rlt 关系
   */
  drawingContainer(rlt, rltType) {
    drawingContainRlt(this.diagram, rlt, rltType)
    // let diagram = this.diagram
    // // 获取到节点的id和节点本身，以及源节点的位置
    // let model = diagram.model
    // let fromCiCode = rlt.ciRlt.sourceCiCode
    // let toCiCode = rlt.ciRlt.targetCiCode
    // // 容器作为目标时 为反向容器关系类型
    // if (rltType && rltType.arrow === 'target') {
    //   fromCiCode = rlt.ciRlt.targetCiCode
    //   toCiCode = rlt.ciRlt.sourceCiCode
    // }
    // let fromID = diagram.getNodeKeyByCiCode(fromCiCode)
    // let toID = diagram.getNodeKeyByCiCode(toCiCode)
    // let fromNode = model.findNodeDataForKey(fromID)
    // let toNode = model.findNodeDataForKey(toID)
    // // 以先拖入元素作为起始位置
    // let fromNodeIndex = model.nodeDataArray.indexOf(fromNode)
    // let toNodeIndex = model.nodeDataArray.indexOf(toNode)
    // let fromLoc = fromNodeIndex < toNodeIndex ? fromNode.loc : toNode.loc
    // // 目标节点已存在一个CI容器内时不调整
    // let isMove = true
    // if (toNode && toNode.group) {
    //   let toNodeGroup = diagram.findNodeForKey(toNode.group)
    //   if (toNodeGroup && toNodeGroup.data.ciCode) {
    //     isMove = false
    //     if (fromNode && fromNode.group && fromNode.isGroup && fromNode.group === toNode.group) {
    //       isMove = true
    //     }
    //   }
    // }
    // if (isMove) {
    //   if (fromNode.isGroup) {
    //     model.setDataProperty(toNode, 'group', fromNode.key)
    //     if (!toNode.isMovingContainer) {
    //       let nodeArray = []
    //       diagram.nodes.each(node => {
    //         if (node.data.hasOwnProperty('group') && node.data.group === fromID && node.data.category !== 'group' && node.data.category !== 'group-collapse') {
    //           nodeArray.push(node)
    //         }
    //       })
    //       // 容器内自动布局(最大3列)
    //       let maxCol = 3
    //       if (nodeArray.length === 4) {
    //         maxCol = 2
    //       }
    //       let layout = $(go.GridLayout, {
    //         wrappingColumn: maxCol,
    //         spacing: go.Size.parse('20 20')
    //       })
    //       let startPoint = go.Point.parse(fromLoc)
    //       startPoint.offset(5, 30)
    //       layout.arrangementOrigin = startPoint
    //       let parts = new go.Set(go.Part)
    //       parts.addAll(nodeArray)
    //       layout.doLayout(parts)
    //       // let maxWidth = -10000
    //       // for (let i = 0; i < nodeArray.length; i += 1) {
    //       //   let node = nodeArray[i]
    //       //   let nodeData = node.data
    //       //   let nodeLeft
    //       //   let loc = go.Point.parse(node.data.loc)
    //       //   let offsetWidth = 0
    //       //   if (nodeData.size) {
    //       //     offsetWidth = parseInt(loc.x)
    //       //   } else if (node.findObject('IMAGE_CONTANIER')) {
    //       //     offsetWidth = parseInt(node.findObject('IMAGE_CONTANIER').width)
    //       //   } else {
    //       //     offsetWidth = node.data.width
    //       //   }
    //       //   nodeLeft = parseInt(nodeData.loc.split(' ')[0]) + offsetWidth
    //       //   maxWidth = Math.max(maxWidth, nodeLeft)
    //       // }
    //       // // 增加40是为了在图形中间添加间距
    //       // if (nodeArray.length !== 0) {
    //       //   model.setDataProperty(toNode, 'loc', `${maxWidth + 40} ${nodeArray[0].data.loc.split(' ')[1]}`)
    //       // }
    //       toNode['isMovingContainer'] = true
    //     }
    //   } else {
    //     try {
    //       // 更改目标元素位置
    //       toNode['isMovingContainer'] = true
    //       model.setDataProperty(toNode, 'loc', fromLoc)
    //       model.removeNodeData(fromNode)
    //       diagram.startTransaction('putIntoContainer')
    //       fromNode.category = 'group'
    //       fromNode['isGroup'] = true
    //       fromNode.imageToContainer = true
    //       model.addNodeData(fromNode)
    //       let node = diagram.findNodeForData(fromNode)
    //       model.setDataProperty(toNode, 'group', node.data.key)
    //       diagram.commitTransaction('putIntoContainer')
    //     } catch (error) {
    //       console.error(error)
    //     }
    //   }
    // }
    // let length = model.linkDataArray.length
    // for (let i = 0; i < length; i += 1) {
    //   let linkData = model.linkDataArray[i]
    //   if (
    //     (linkData.from === fromID && linkData.to === toID) ||
    //     (linkData.from === toID && linkData.to === fromID)
    //   ) {
    //     model.removeLinkData(linkData)
    //     i -= 1
    //     length -= 1
    //   }
    // }
  }
  // 获取到节点是否有工单数据
  getWork() {
    // const ciCodes = this.diagram.getDiagramCiCodes()
    // queryExternalDataCountByCiCodes(ciCodes).then(res => {
    //   if (res && Array.isArray(res.data) && res.data.length) {
    //     this.diagram.nodes.each(item => {
    //       if (res.data.find(list => list.ciCode === item.data.ciCode)) {
    //         item.isNotWork = true
    //       }
    //     })
    //   }
    //   this.diagram.updateAllTargetBindings()
    // })
  }
  // 配置告警数据
  configureEvent(eventData) {
    let eventList = eventData
    let model = this.diagram.model
    let nodeDataArray = model.nodeDataArray
    let linkDataArray = model.linkDataArray
    this.diagram.skipsUndoManager = true
    this.diagram.startTransaction('setEventList')
    nodeDataArray.forEach(nodeData => {
      model.setDataProperty(nodeData, 'eventList', [])
    })
    linkDataArray.forEach(linkData => {
      model.setDataProperty(linkData, 'eventList', [])
    })
    eventList.forEach(event => {
      nodeDataArray.forEach(nodeData => {
        if (event.ciName === nodeData.ciCode) {
          nodeData.eventList.push(event)
        }
      })
      linkDataArray.forEach(linkData => {
        if (event.ciId === String(linkData.rltId)) {
          linkData.eventList.push(event)
        }
      })
    })
    nodeDataArray.forEach(nodeData => {
      if (Array.isArray(nodeData.eventList)) {
        model.setDataProperty(nodeData, 'eventList', nodeData.eventList)
        let severityList = []
        nodeData.eventList.forEach(item => {
          severityList.push(item.severity)
        })
        severityList.sort((m, n) => m - n)
        model.setDataProperty(nodeData, 'severity', severityList[0])
      }
      let alarmFontColor = store.getters.themeConfig.alarmFontColor
      if (Array.isArray(nodeData.eventList) && alarmFontColor) {
        model.setDataProperty(nodeData, 'alarmFontColor', alarmFontColor)
      }
    })
    linkDataArray.forEach(linkData => {
      if (Array.isArray(linkData.eventList)) {
        model.setDataProperty(linkData, 'eventList', linkData.eventList)
        let severityList = []
        linkData.eventList.forEach(item => {
          severityList.push(item.severity)
        })
        severityList.sort((m, n) => m - n)
        model.setDataProperty(linkData, 'severity', severityList[0])
        let eventConfig = store.getters.eventConfig
        if (linkData.eventList.length) {
          model.setDataProperty(
            linkData,
            'stroke',
            eventConfig.get(severityList[0]).color
          )
        }
      }
    })
    this.diagram.updateAllTargetBindings()
    this.diagram.commitTransaction('setEventList')
    this.diagram.skipsUndoManager = false
  }
  // 获取画布中的告警
  getEvent() {
    if (!SYS_CONFIG.IS_UPDATE_ALARM_KPI_INTERVAL) return
    if (!this.diagram.getDiagramCiCodes().length) {
      return
    }
    if (getHashParam('active') === 0) {
      let param = {
        startTime: changeTimeFormat(getHashParam('starttime')),
        endTime: changeTimeFormat(getHashParam('endtime')),
        ciCodes: this.diagram.getDiagramCiCodes(),
        pageNum: 1,
        pageSize: 500
      }
      getEventHistoryByCiCodes(param).then(res => {
        if (Array.isArray(res.data)) {
          this.configureEvent(res.data)
        }
      })
      return
    }
    let params = {
      ciCodes: this.diagram.getDiagramCiCodes(),
      rltIds: this.diagram.getDiagramRltIds(1)
    }
    getEventListByCiCodes(params).then(res => {
      if (Array.isArray(res.data)) {
        this.configureEvent(res.data)
      }
    })
  }

  /**
   * 获取关联视图的告警信息
   */
  getRelatedDiagramEvent(callback) {
    let diagramId
    // 获取当前视图的Id
    let diagramSheet = store.getters.diagramSheet
    diagramSheet.forEach(sheet => {
      if (sheet && sheet.active) {
        // 获取组合视图中当前视图Id
        if (sheet.combDiagramInfos && sheet.combDiagramInfos.length) {
          sheet.combDiagramInfos.forEach(diagramInfo => {
            if (diagramInfo.active) {
              diagramId = diagramInfo.diagram.id
            }
          })
        } else {
          diagramId = sheet.diagram.id
        }
      }
    })
    if (!diagramId) {
      return
    }
    queryRelatedDiagramEventByDiagramId(diagramId).then(res => {
      if (Array.isArray(res.data)) {
        let relatedEventList = res.data
        let nodeDataArray = this.diagram.model.nodeDataArray
        nodeDataArray.forEach(nodeData => {
          nodeData.relatedEventList = []
          nodeData.relatedSeverity = -1
        })
        nodeDataArray.forEach(nodeData => {
          let severityList = []
          relatedEventList.forEach(relatedEvent => {
            if (nodeData.rltViews) {
              nodeData.rltViews.forEach(view => {
                let relId = null
                if (typeof view === 'object') {
                  relId = view.id
                } else if (typeof view === 'string') {
                  relId = view
                }
                if (
                  relId &&
                  relId === relatedEvent.diagramId &&
                  relatedEvent.maxEventLevel >= 0
                ) {
                  severityList.push(relatedEvent.maxEventLevel)
                }
              })
            }
          })
          severityList.sort((m, n) => m - n)
          nodeData.relatedSeverity = severityList[0] ? severityList[0] : -1
        })
        this.diagram.updateAllTargetBindings()
      }
      callback && callback(res.data)
    })
  }

  getIntervalEvent(interval) {
    if (SYS_CONFIG.IS_UPDATE_ALARM_KPI_INTERVAL) {
      let eventInterval = interval || 30000
      setTimeout(() => {
        if (getHashParam('active') !== 0) {
          this.getEvent()
        }
        this.getRelatedDiagramEvent()
        this.getPerformance()
        this.getIntervalEvent(eventInterval)
      }, eventInterval)
    }
  }
  // 更新模板内容
  getTemplateInfo() {
    let hasPartMountCiCount = this.diagram.nodes.any(el => {
      if (el.data.isGroup && el.data.partMountConditions) {
        return true
      }
    })
    if (!hasPartMountCiCount) return false
    let mountCiDraw = new MountCiDraw({ diagram: this.diagram })
    let diagramTemplate = this.diagram.model.modelData.diagramTemplate
    if (diagramTemplate && diagramTemplate.diagramTemplateId) {
      this.diagram.removeParts(this.diagram.nodes)
      this.getDiagramInfo(diagramTemplate.diagramTemplateId, 0, false).then(
        res => {
          this.diagram.model.addNodeDataCollection(res.json[0].nodeDataArray)
          if (diagramTemplate.entranceCi && diagramTemplate.friendDefId) {
            let params = {
              ciCode: diagramTemplate.entranceCi,
              friendDefId: diagramTemplate.friendDefId
            }
            queryFriendByDef(params).then(res => {
              if (res && res.data && Array.isArray(res.data.ciNodes)) {
                mountCiDraw.metchDiagramCi(res.data.ciNodes)
              }
            })
          }
          this.diagram.zoomToCenter()
        }
      )
    }
  }
  getPerformance() {
    if (!this.diagram.getDiagramCiCodes().length) {
      return
    }
    let params = {
      ciCodes: this.diagram.getDiagramCiCodes()
    }
    queryCurrentPerformancesByCiCodes(params).then(res => {
      if (Array.isArray(res.data)) {
        this.diagram.nodes.each(node => {
          res.data.forEach(item => {
            if (item.ciCode === node.data.ciCode) {
              node.kpiList = item.kpiList
            }
          })
        })
        this.diagram.action.refreshMonitorTheme(this.diagram)
      }
    })
  }
  parseXml2Json(xml) {
    return new Promise((resolve, reject) => {
      xml2Json({
        xml: xml
      }).then(res => {
        if (res.data) {
          res.data = res.data.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
          let data = JSON.parse(res.data)
          // 处理线上的双击文字
          if (Array.isArray(data.nodeDataArray)) {
            data.nodeDataArray.forEach((nodeData, index) => {
              nodeData.label = unescapeHTML(nodeData.label)
              if (
                nodeData.category === 'text' &&
                nodeData.group &&
                nodeData.group !== '1'
              ) {
                const linkData = getDataById(data.linkDataArray, nodeData.group)
                if (linkData) {
                  linkData.label = nodeData.label
                  nodeData.willDelete = true
                }
              }
              if (!nodeData.width || !nodeData.height) {
                nodeData.willDelete = true
              }
            })
            data.nodeDataArray = data.nodeDataArray.filter(node => {
              return (
                !node.willDelete &&
                !isNaN(go.Point.parse(node.loc).x) &&
                !isNaN(go.Point.parse(node.loc).y)
              )
            })
            data.nodeDataArray.forEach(nodeData => {
              // 处理label位置
              labelCompatible(nodeData)
              if (nodeData.dashed === '1') {
                nodeData.strokeDashArray = [4, 4]
              }
              // 处理透明度
              if (nodeData.opacity) {
                let opacity = parseFloat(nodeData.opacity)
                if (opacity > 1) {
                  opacity = opacity / 100
                }
                nodeData.opacity = opacity
              }
              if (
                (nodeData.category === 'shape' ||
                  nodeData.category === 'group') &&
                !nodeData.fill
              ) {
                nodeData.fill = '#fff'
              }
              if (nodeData.category === 'text') {
                if (!nodeData.stroke) {
                  nodeData.stroke = null
                }
              }
              // 处理容器大小和颜色
              if (nodeData.isGroup) {
                let headerHeight = parseInt(nodeData.startSize) || 25
                const fontSize = parseInt(nodeData.fontSize) || 12
                if (headerHeight < fontSize * 1.5) {
                  headerHeight = fontSize * 1.5
                }
                nodeData.size = `${
                  go.Size.parse(nodeData.size).width
                } ${go.Size.parse(nodeData.size).height - headerHeight}`
                nodeData.fontColor = nodeData.fontColor || '#000'
                nodeData.stroke = nodeData.stroke || '#000'
                nodeData.strokeWidth = Number(nodeData.strokeWidth)
                nodeData.headerHeight = headerHeight
              }
              nodeData.loc = go.Point.stringify(
                getAbsoluteLocation(data.nodeDataArray, nodeData)
              )
              // 处理 html label显示
              if (String(nodeData.html) === '1' && nodeData.label) {
                nodeData.label = parseInnerText(nodeData.label)
              }
              // 下钻视图
              if (nodeData.rltViews) {
                nodeData.rltViews = nodeData.rltViews.split(',')
                nodeData.rltViews = nodeData.rltViews.map(view => {
                  return { id: Number(view) }
                })
              }
              // 挂载数据字段
              if (nodeData.mountConditions) {
                try {
                  nodeData.mountConditions = JSON.parse(
                    nodeData.mountConditions
                  )
                } catch (error) {
                  nodeData.mountConditions = null
                }
              }
              if (nodeData.childMountData) {
                try {
                  nodeData.childMountData = JSON.parse(nodeData.childMountData)
                } catch (error) {
                  nodeData.childMountData = null
                }
              }
              // 替换assets中的默认图标
              if (nodeData.image === 'assets/images/class_big.png') {
                nodeData.image = 'static/images/default-node.png'
              }
            })
          }
          // 处理没有箭头的物理线
          if (Array.isArray(data.linkDataArray)) {
            // 过滤掉起点和终点相同的线以及父集不是画布的线
            data.linkDataArray = data.linkDataArray.filter(link => {
              return !(link.from && link.to && link.from === link.to)
            })
            // 去除找不到线起始和目的节点的线
            data.linkDataArray = data.linkDataArray.filter(link => {
              return !(link.from && !getDataByKey(data.nodeDataArray, link.from))
            })
            data.linkDataArray = data.linkDataArray.filter(link => {
              return !(link.to && !getDataByKey(data.nodeDataArray, link.to))
            })
            data.linkDataArray.forEach(linkData => {
              linkData.label = unescapeHTML(linkData.label)
              switch (linkData.toArrow) {
                case 'None':
                  linkData.noArrow = true
                  break
                case 'open':
                  linkData.toArrow = 'OpenTriangle'
                  break
                case 'block':
                  linkData.toArrow = 'Triangle'
                  break
                case 'diamondThin':
                  linkData.toArrow = 'StretchedDiamond'
                  break
                case 'oval':
                  linkData.toArrow = 'Circle'
                  break
                case 'dash':
                  linkData.toArrow = 'BackSlash'
                  break
              }
              if (linkData.endFill === '0') {
                linkData.toArrowOutline = true
              } else {
                linkData.toArrowOutline = false
              }
              if (
                linkData.toArrow === 'Standard' &&
                linkData.fromArrow === 'Standard'
              ) {
                linkData.toArrow = 'TwoWay'
              }
              if (linkData.rltId) {
                linkData.rltId = Number(linkData.rltId)
              }
              if (linkData.dashed === '1') {
                linkData.strokeDashArray = [4, 4]
              }
              // 下钻视图
              if (linkData.rltViews) {
                linkData.rltViews = linkData.rltViews.split(',')
                linkData.rltViews = linkData.rltViews.map(view => {
                  return { id: Number(view) }
                })
              }
              // 处理没有源或目的的线的坐标
              if (
                !linkData.from &&
                linkData.sourcePoint &&
                JSON.stringify(linkData.sourcePoint) !==
                  JSON.stringify(linkData.targetPoint)
              ) {
                const sourceX = Number(linkData.sourcePoint.x) || 0
                const sourceY = Number(linkData.sourcePoint.y) || 0
                const sourcePoint = []
                sourcePoint.push(sourceX)
                sourcePoint.push(sourceY)
                if (linkData.to) {
                  const nodeData = getDataByKey(data.nodeDataArray, linkData.to)
                  if (nodeData) {
                    const targetW = Number(nodeData.width)
                    const targetH = Number(nodeData.height)
                    const targetX = go.Point.parse(nodeData.loc).x - targetW / 2
                    const targetY = go.Point.parse(nodeData.loc).y - targetH / 2
                    sourcePoint.push(targetX)
                    sourcePoint.push(targetY)
                  }
                }
                if (!linkData.points) {
                  linkData.points = []
                }
                if (linkData.points.length) {
                  linkData.points = linkData.points.map(point => {
                    return Number(point)
                  })
                }
                linkData.points = sourcePoint.concat(linkData.points)
              }
              if (
                !linkData.to &&
                linkData.targetPoint &&
                JSON.stringify(linkData.targetPoint) !==
                  JSON.stringify(linkData.sourcePoint)
              ) {
                const targetX = Number(linkData.targetPoint.x) || 0
                const targetY = Number(linkData.targetPoint.y) || 0
                const targetPoint = []
                if (linkData.from) {
                  const nodeData = getDataByKey(
                    data.nodeDataArray,
                    linkData.from
                  )
                  if (nodeData) {
                    const sourceW = Number(nodeData.width)
                    const sourceH = Number(nodeData.height)
                    const sourceX = go.Point.parse(nodeData.loc).x - sourceW / 2
                    const sourceY = go.Point.parse(nodeData.loc).y - sourceH / 2
                    targetPoint.push(sourceX)
                    targetPoint.push(sourceY)
                  }
                }
                targetPoint.push(targetX)
                targetPoint.push(targetY)
                if (!linkData.points) {
                  linkData.points = []
                }
                linkData.points = linkData.points.concat(targetPoint)
              }
              if (Array.isArray(linkData.points)) {
                linkData.points = linkData.points.map(point => {
                  return Number(point)
                })
              }
              // 处理折线坐标
              // curvePointCompatible(linkData, data)
            })
          }
          data.modelData = Object.assign(
            Object.assign({}, data.diagramData),
            data.modelData
          )
          if (data.modelData.diagramMountConditions) {
            try {
              data.modelData.diagramMountConditions = JSON.parse(
                data.modelData.diagramMountConditions
              )
            } catch (error) {
              data.modelData.diagramMountConditions = null
            }
          }
          let logicLink
          if (
            String(data.modelData.logicLink) === 'true' ||
            String(data.modelData.logicLink) === '1'
          ) {
            logicLink = true
          } else {
            logicLink = false
          }
          data.modelData.oldVersionDiagram = true
          data.modelData.logicLink = logicLink
          // 处理group字段找不到的问题以及位置问题
          if (Array.isArray(data.nodeDataArray)) {
            data.nodeDataArray.forEach(nodeData => {
              if (nodeData.hasOwnProperty('group')) {
                if (!nodeData.group) {
                  delete nodeData.group
                } else {
                  let group = data.nodeDataArray.find(
                    nodeDataItem => nodeDataItem.key === nodeData.group
                  )
                  if (!group) {
                    delete nodeData.group
                  }
                }
              }
            })
          }
          resolve(data)
        } else {
          reject(new Error(L.get('COMMON_VIEW_DATA_EXCEPTION', null)))
        }
      })
    })
  }
  getCiInfoQueryParams(ciInfoList) {
    let ciInfoParams = []
    let nodeDataArray = this.diagram.model.nodeDataArray
    // 查询关系用的接口版本不对。这个接口版本用的是上次json的 不知道到为啥没有更新
    if (ciInfoList) {
      ciInfoList.forEach(currentCi => {
        nodeDataArray.forEach(ci => {
          if (ci.ciCode === currentCi.ci.ciCode) {
            ci.ciId = currentCi.ci.id
            ci.ciVersion = currentCi.ci.ciVersion
          }
          // if (ci.libType)
          ['left', 'top', 'right', 'bottom'].forEach(item => {
            if (ci.interfaces) {
              if (ci.interfaces[item].length > 0) {
                ci.interfaces[item].forEach(item => {
                  if (item.ciCode === currentCi.ci.ciCode) {
                    item.ciId = currentCi.ci.id
                    item.ciVersion = currentCi.ci.ciVersion
                  }
                })
              }
            }
          })
        })
      })
    }

    nodeDataArray.forEach(cell => {
      if (cell.ciCode) {
        ciInfoParams.push({
          ciCode: cell.ciCode,
          ciVersion: cell.ciVersion,
          ciId: cell.ciId
        })
      }
    })

    ciInfoParams = ciInfoParams.concat(this.diagram.findAllInterfaceCiCode(item => {
      return {
        ciCode: item.ciCode,
        ciVersion: item.ciVersion,
        ciId: item.ciId
      }
    }))
    return ciInfoParams
  }
  /**
   * 获取视图所有CI和关系的配置信息
   */
  fetchCiAndRltInfo() {
    let isSubmitApproval = interfacesUtil.isApprovalDiagram()
    let dirType = getQueryString('dirType')
    let currentDiagram = store.getters.diagramSheet.find(item => item.active)
    let changeSubmit = currentDiagram.taskRepresentation && currentDiagram.taskRepresentation.taskKey === 'change'
    // 未审批通过的设计单元视图查询数据
    if ((Number(dirType) === 2 && !isSubmitApproval) || changeSubmit) {
      let ciIds = this.diagram.getDiagramCiIds()
      ciIds = ciIds.concat(this.diagram.findAllInterfaceCiIds())
      let ciInfoParams = this.getCiInfoQueryParams()
      return Promise.all([
        ciUtil.getCiInfoByIds(ciIds),
        ciRltUtils.queryCiRltList(ciInfoParams, 1)
      ]).then(result => {
        this.updateCiAndRltInfo(result[0], result[1])
        return result
      })
    } else { // 展示视图及审批的设计单元更新信息
      let ciCodes = this.diagram.getDiagramCiCodes()
      ciCodes = ciCodes.concat(this.diagram.findAllInterfaceCiCode())
      let rltLibType = ciUtil.getQueryRltLibType()
      if (Number(dirType) === 2 && isSubmitApproval) {
        rltLibType = 2
      }
      let libType = isSubmitApproval ? 2 : ''
      return new Promise(async resolve => {
        let ciInfoList = await ciUtil.getCiInfoByCodes(ciCodes, libType)
        this.updateCiInfo(ciInfoList)

        let ciInfoParams = this.getCiInfoQueryParams(ciInfoList)
        let rltInfoList = await ciRltUtils.queryCiRltList(ciInfoParams, rltLibType)
        this.updateRltInfo(rltInfoList)
        resolve([ciInfoList, rltInfoList])
      })
    }
  }
  /**
   * 更新CIId、图片及配置信息
   */
  updateCiAndRltInfo(ciInfoList, linkInfoList) {
    this.updateCiInfo(ciInfoList)
    this.updateRltInfo(linkInfoList)
  }
  updateCiInfo(ciInfoList) {
    if (Array.isArray(ciInfoList)) {
      let model = this.diagram.model
      let nodes = model.nodeDataArray
      let oldskips = this.diagram.skipsUndoManager
      this.diagram.skipsUndoManager = true
      nodes.forEach(node => {
        let ciLabel
        if (node.ciClass && node.attrs) {
          ciLabel = ciUtil.getCiShowLabel(node.ciClass.id, node.attrs)
        }
        if (Array.isArray(node.eventList) && node.eventList.length) {
          node.eventList.forEach(item => {
            item.ciLabel = ciLabel || node.label
          })
        }
        if (node.ciCode || node.ciId) {
          let ciInfo = ciInfoList.find(item => {
            return item.ci.ciCode === node.ciCode || item.ci.ciId === node.ciId
          })
          if (ciInfo) {
            model.setDataProperty(node, 'ciId', ciInfo.ci.id)
            model.setDataProperty(node, 'attrs', ciInfo.attrs)
            model.setDataProperty(node, 'ci', ciInfo.ci)
            model.setDataProperty(node, 'ciClass', ciInfo.ciClass)
            model.setDataProperty(node, 'noData', false)
            model.setDataProperty(node, 'ciVersion', ciInfo.ci.ciVersion)
            if (!node.ciCode) {
              model.setDataProperty(node, 'ciCode', ciInfo.ci.ciCode)
            }
            // 是否处于展示视图
            // let dirType = getQueryString('dirType')
            // let overArr = ['5', '6']
            // let isShowView = overArr.find(i => i === dirType)
            if (SYS_CONFIG.DIAGRAM_UPDATE_CI_DATA && node.label) {
              let ciClassInfo = ciClassUtils.getCiClassById(ciInfo.ci.classId)
              let configAttr = model.modelData.configSelectAttrObj
              let label = node.label.replace('\n', '')
              let newLabel = ciClassUtils.getCiLabel(ciInfo, ciClassInfo, configAttr)
              if (newLabel && newLabel.replace('\n', '') !== label) {
                model.setDataProperty(node, 'label', newLabel)
              }
            }
            if (getQueryString('dirType') === '2' && interfacesUtil.isApprovalDiagram()) {
              node.libType = 2
            }
          } else {
            this.diagram.removeCiInPrivateLibByCode(node.ciCode)
            let dirType = getQueryString('dirType')
            let overArr = ['5', '6']
            let isShowView = overArr.find(i => i === dirType)
            if (SYS_CONFIG.DIAGRAM_UPDATE_CI_DATA && !isShowView) {
              model.removeNodeData(node)
            } else {
              model.setDataProperty(node, 'noData', true)
            }
          }
        }
        // 处理接口信息
        if (Array.isArray(ciInfoList) && node.interfaces) {
          ['left', 'top', 'right', 'bottom'].forEach(item => {
            if (node.interfaces[item].length > 0) {
              node.interfaces[item].forEach(item => {
                ciInfoList.forEach(ciInfo => {
                  if (item.ciCode === ciInfo.ci.ciCode) {
                    item.ciId = ciInfo.ci.id
                    item.ciVersion = ciInfo.ci.ciVersion
                    item.attrs = ciInfo.attrs
                    item.ciClass = ciInfo.ciClass
                  }
                })
              })
            }
          })
        }
      })
      this.diagram.skipsUndoManager = oldskips
    }
  }
  updateRltInfo(linkInfoList) {
    // let rltLibType = ciUtil.getQueryRltLibType()
    // let ciInfoParams = this.getCiInfoQueryParams()
    // ciRltUtils.queryCiRltList(ciInfoParams, rltLibType).then(res => {
    if (Array.isArray(linkInfoList) && linkInfoList.length) {
      let model = this.diagram.model
      let links = model.linkDataArray
      let oldskips = this.diagram.skipsUndoManager
      this.diagram.skipsUndoManager = true
      let sourceObject = L.get('BASE_SOURCE_OBJECT')
      let sourceClass = L.get('COMMON_SOURCE_CLASSIFICATION')
      let targetObject = L.get('BASE_TARGET')
      let targetClass = L.get('COMMON_TARGET_CLASSIFICATION')
      let rltAuto = SYS_CONFIG.RLT_AUTO_ATTR
      links.forEach(link => {
        let linkInfo = null
        let attrs = []
        if (link.ciRlt) {
          linkInfo = linkInfoList.find(item => {
            if (link.ciRlt.ciCode) {
              return item.ciRlt.ciCode === link.ciRlt.ciCode
            } else if (link.ciRlt.sourceCiCode && link.ciRlt.targetCiCode && link.ciRlt.classId) {
              return item.ciRlt.sourceCiCode === link.ciRlt.sourceCiCode &&
                item.ciRlt.targetCiCode === link.ciRlt.targetCiCode &&
                item.ciRlt.classId === link.ciRlt.classId
            }
          })
          if (linkInfo) {
            let sheetList = deepCopy(store.getters.diagramSheet)
            let diagramSheet = sheetList.find(n => n.active)
            let componentConnectView = diagramSheet.json.find(n => n.diagram.componentConnectId && n.diagram.componentConnectId === link.rltId)
            if (componentConnectView) {
              componentConnectView.diagram.componentConnectId = linkInfo.ciRlt.id
              store.commit('SET_DIAGRAM_SHEET', sheetList)
            }
            model.setDataProperty(link, 'rltId', linkInfo.ciRlt.id)
          }
        } else if (link.rltId) {
          linkInfo = linkInfoList.find(item => {
            return item.ciRlt.id === link.rltId
          })
        }
        if (linkInfo) {
          const arrtsArray = linkInfo.attrs
          for (let name in rltAuto) {
            if (
              rltAuto.hasOwnProperty(name) &&
              arrtsArray &&
              arrtsArray[name]
            ) {
              let int = Number(arrtsArray[name])
              model.setDataProperty(link, rltAuto[name], int)
            }
          }
          const rltInfoArray = linkInfo.rltClassInfo.attrDefs
          for (let attr in arrtsArray) {
            if (arrtsArray.hasOwnProperty(attr)) {
              let info = rltInfoArray.find(item => item.proStdName === attr)
              attrs.push({ key: info.proName, value: arrtsArray[attr] })
            }
          }
          let sourceCiClass = ciClassUtils.getCiClassById(linkInfo.ciRlt.sourceClassId)
          let targetCiClass = ciClassUtils.getCiClassById(linkInfo.ciRlt.targetClassId)
          let otherAttr = []
          if (sourceCiClass && sourceCiClass.ciClass && sourceCiClass.ciClass.className && targetCiClass && targetCiClass.ciClass && targetCiClass.ciClass.className) {
            otherAttr = [
              { key: sourceObject, value: linkInfo.ciRlt.sourceCiCode },
              {
                key: sourceClass,
                value: sourceCiClass.ciClass.className
              },
              { key: targetObject, value: linkInfo.ciRlt.targetCiCode },
              {
                key: targetClass,
                value: targetCiClass.ciClass.className
              }
            ]
          }
          attrs = otherAttr.concat(attrs)
          model.setDataProperty(link, 'attrs', attrs)
          model.setDataProperty(link, 'ciRlt', linkInfo.ciRlt)
          model.setDataProperty(link, 'rltClass', linkInfo.rltClassInfo.ciClass)
          model.setDataProperty(link, 'rltClassName', linkInfo.rltClassInfo.ciClass.className)
          model.setDataProperty(link, 'noData', false)
          model.setDataProperty(link, 'rltInfo', linkInfo) // 保存关系信息，供后续使用
        } else {
          let dirType = getQueryString('dirType')
          let overArr = ['5', '6']
          let isShowView = overArr.find(i => i === dirType)
          if (SYS_CONFIG.DIAGRAM_UPDATE_CI_DATA && !isShowView) {
            model.removeLinkData(link)
          } else {
            model.setDataProperty(link, 'noData', true)
          }
        }
      })
      // 删除多余的组件连接
      let linkFilterMap = new Map()
      let { linkDataArray } = this.diagram.model
      linkDataArray.forEach(link => {
        if (link.fromPort && link.toPort && link.rltClassName === '组件连接实例') {
          let key = link.fromPort + link.toPort + ''
          let value = linkFilterMap.get(key) || []
          value.push(link)
          linkFilterMap.set(key, value)
        }
      })
      if (linkFilterMap.size) {
        linkFilterMap.forEach((val, key) => {
          if (val.length > 1) {
            let filterArr = val.filter(item => !item.attrs.find(attr => attr.key === '连接件'))
            let filterRitArr = val.filter(item => item.attrs.find(attr => attr.key === '连接件'))
            if (filterArr.length && filterRitArr.length) {
              filterArr.forEach(link => {
                this.diagram.model.setDataProperty(link, 'visible', false)
              })
              if (filterRitArr.length > 1) {
                filterRitArr.shift()
                filterRitArr.forEach(link => {
                  this.diagram.model.setDataProperty(link, 'visible', false)
                })
              }
            } else {
              val.shift()
              val.forEach(link => {
                this.diagram.model.setDataProperty(link, 'visible', false)
              })
            }
          }
        })
      }
      this.diagram.skipsUndoManager = oldskips
    }
    // })
  }
  /**
   * 获取所有link的配置信息
   */
  fetchlinkInfo(cells) {
    let model = this.diagram.model
    if (!Array.isArray(cells)) {
      cells = model.linkDataArray
    }
    let ciCodes = []
    cells.forEach(cell => {
      if (cell.ciCode) {
        ciCodes.push(cell.ciCode)
      } else if (Array.isArray(cell.ciCodes)) {
        ciCodes = ciCodes.concat(cell.ciCodes)
      }
    })
    return ciUtil.getCiInfoByCodes(ciCodes)
  }
  /**
   * 图标修复
   *
   * @returns Promise
   * @memberof DiagramManager
   */
  repairNodesImage(cells) {
    let model = this.diagram.model
    if (!Array.isArray(cells)) {
      cells = model.nodeDataArray
    }
    cells = cells.filter(cell => {
      return (
        cell.image &&
        (cell.imgName ||
          (cell.ciCode && !cell.noData) ||
          Array.isArray(cell.ciCodes))
      )
    })
    return new Promise((resolve, reject) => {
      if (cells.length) {
        let imageNames = []
        cells.forEach(cell => {
          if (
            cell.image &&
            cell.imgName &&
            imageNames.indexOf(cell.imgName) === -1
          ) {
            imageNames.push(cell.imgName)
          }
        })
        queryImagesByNames({ imageNames }).then(async result => {
          let imgList = result.data || []
          let oldskips = this.diagram.skipsUndoManager
          this.diagram.skipsUndoManager = true
          for (let i = 0; i < cells.length; i++) {
            let cell = cells[i]
            try {
              let imgInfo
              if (Array.isArray(imgList)) {
                if (cell.imgFullName) {
                  imgInfo = imgList.find(img => {
                    return img.imgFullName === cell.imgFullName
                  })
                }
                if (!imgInfo) {
                  imgInfo = imgList.find(img => {
                    return img.imgName === cell.imgName
                  })
                }
              }
              if (cell.category === 'image') {
                if (imgInfo) {
                  if (imgInfo.imgPath !== cell.image) {
                    model.setDataProperty(cell, 'image', imgInfo.imgPath)
                    model.setDataProperty(cell, 'width', imgInfo.imgWidth)
                    model.setDataProperty(cell, 'height', imgInfo.imgHeigh)
                  }
                } else {
                  let imgUrl = ''
                  if (
                    cell.ciCode &&
                    !cell.noData &&
                    cell.ciClass &&
                    cell.ciClass.icon
                  ) {
                    imgUrl = cell.ciClass.icon
                  }
                  let imgInfo = await getImageInfo(imgUrl)
                  model.setDataProperty(cell, 'image', imgInfo.src)
                  model.setDataProperty(cell, 'width', imgInfo.width)
                  model.setDataProperty(cell, 'height', imgInfo.height)
                }
              }
            } catch (error) {
              let imgInfo = {
                src: 'static/images/default-node.png',
                width: 80,
                height: 44
              }
              model.setDataProperty(cell, 'image', imgInfo.src)
              model.setDataProperty(cell, 'width', imgInfo.width)
              model.setDataProperty(cell, 'height', imgInfo.height)
            }
          }
          this.diagram.skipsUndoManager = oldskips
          errorImages = [] // 清空错误图片缓存
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  // 清除交易线和组合交易高亮效果
  cleanTradPortEffect() {
    if (interfacesUtil.isTdPtView()) return
    let { nodeDataArray, linkDataArray } = this.diagram.model
    nodeDataArray.forEach(item => {
      this.diagram.model.setDataProperty(item, 'opacity', 1)
      if (item.hasTradingPoint) {
        this.diagram.model.setDataProperty(item, 'isTradingPoint', false)
      }
    })
    linkDataArray.forEach(item => {
      this.diagram.model.setDataProperty(item, 'opacity', 1)
      if (item.showTradingLineA) {
        this.diagram.model.setDataProperty(item, 'showTradingLineA', false)
      }
      if (item.showTradingLineB) {
        this.diagram.model.setDataProperty(item, 'showTradingLineB', false)
      }
      if (item.showPortfolioChart) {
        this.diagram.model.setDataProperty(item, 'showPortfolioChart', false)
      }
    })
    this.diagram.model.linkDataArray = linkDataArray
    this.diagram.model.nodeDataArray = nodeDataArray
  }
}

function getDataByKey(arr, key) {
  let result = null
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].key === key) {
      result = arr[i]
    }
  }
  return result
}

function getDataById(arr, key) {
  let result = null
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === key) {
      result = arr[i]
    }
  }
  return result
}

function getAbsoluteLocation(nodeDataArray, nodeData) {
  if (nodeData.group) {
    const group = getDataByKey(nodeDataArray, nodeData.group)
    const diagramPadding = 5
    if (group && group.isGroup) {
      return {
        x:
          go.Point.parse(group.loc).x +
          go.Point.parse(nodeData.loc).x -
          group.width / 2 +
          nodeData.width / 2 +
          diagramPadding,
        y:
          go.Point.parse(group.loc).y +
          go.Point.parse(nodeData.loc).y -
          group.height / 2 +
          nodeData.height / 2 +
          diagramPadding
      }
    } else {
      nodeData.group = null
      return {
        x: go.Point.parse(nodeData.loc).x + diagramPadding,
        y: go.Point.parse(nodeData.loc).y + diagramPadding
      }
    }
  } else {
    return {
      x: go.Point.parse(nodeData.loc).x + nodeData.width / 2,
      y: go.Point.parse(nodeData.loc).y + nodeData.height / 2
    }
  }
}

let errorImages = [] // 错误图片缓存
async function getImageInfo(imageUrl) {
  return new Promise(resolve => {
    const defaultImageInfo = {
      src: 'static/images/default-node.png',
      width: 80,
      height: 44
    }
    if (!imageUrl || errorImages.includes(imageUrl)) {
      resolve(defaultImageInfo)
    } else {
      if (imageUrl.startsWith('/')) {
        imageUrl = window.localStorage.getItem('rsmRoot') + imageUrl
      }
      let oImg = new Image()
      oImg.src = imageUrl
      oImg.onload = e => {
        let img = e.path[0]
        let src = img.getAttribute('src')
        resolve({ src, width: img.width, height: img.height })
      }
      oImg.onerror = () => {
        errorImages.push(imageUrl)
        resolve(defaultImageInfo)
      }
    }
  })
}

// label老图位置兼容
function labelCompatible(nodeData) {
  nodeData.textAlign = nodeData.align || 'center'
  if (nodeData.verticalAlign) {
    let verticalAlign = nodeData.verticalAlign
    if (verticalAlign === 'top') {
      nodeData.alignment = {
        class: 'go.Spot',
        x: 0.5,
        y: 0,
        offsetX: 0,
        offsetY: 0
      }
      nodeData.alignmentFocus = {
        class: 'go.Spot',
        x: 0.5,
        y: 0,
        offsetX: 0,
        offsetY: 0
      }
    }
    if (verticalAlign === 'bottom') {
      nodeData.alignment = {
        class: 'go.Spot',
        x: 0.5,
        y: 1,
        offsetX: 0,
        offsetY: 0
      }
      nodeData.alignmentFocus = {
        class: 'go.Spot',
        x: 0.5,
        y: 1,
        offsetX: 0,
        offsetY: 0
      }
    }
    if (verticalAlign === 'middle') {
      nodeData.alignment = {
        class: 'go.Spot',
        x: 0.5,
        y: 0.5,
        offsetX: 0,
        offsetY: 0
      }
      nodeData.alignmentFocus = {
        class: 'go.Spot',
        x: 0.5,
        y: 0.5,
        offsetX: 0,
        offsetY: 0
      }
    }
  }
  if (nodeData.labelPosition || nodeData.verticalLabelPosition) {
    if (nodeData.labelPosition === 'left') {
      nodeData.alignment = {
        class: 'go.Spot',
        x: 0,
        y: 0.5,
        offsetX: 0,
        offsetY: 0
      }
      nodeData.alignmentFocus = {
        class: 'go.Spot',
        x: 1,
        y: 0.5,
        offsetX: 0,
        offsetY: 0
      }
    }
    if (nodeData.labelPosition === 'right') {
      nodeData.alignment = {
        class: 'go.Spot',
        x: 1,
        y: 0.5,
        offsetX: 0,
        offsetY: 0
      }
      nodeData.alignmentFocus = {
        class: 'go.Spot',
        x: 0,
        y: 0.5,
        offsetX: 0,
        offsetY: 0
      }
    }
    if (nodeData.verticalLabelPosition === 'top') {
      nodeData.alignment = {
        class: 'go.Spot',
        x: 0.5,
        y: 0,
        offsetX: 0,
        offsetY: 0
      }
      nodeData.alignmentFocus = {
        class: 'go.Spot',
        x: 0.5,
        y: 1,
        offsetX: 0,
        offsetY: 0
      }
    }
    if (nodeData.verticalLabelPosition === 'bottom') {
      nodeData.alignment = {
        class: 'go.Spot',
        x: 0.5,
        y: 1,
        offsetX: 0,
        offsetY: 0
      }
      nodeData.alignmentFocus = {
        class: 'go.Spot',
        x: 0.5,
        y: 0,
        offsetX: 0,
        offsetY: 0
      }
    }
  }
}

// 折线坐标老图兼容
// function curvePointCompatible (linkData, data) {
//   if (Array.isArray(linkData.points) && linkData.edgeStyle === 'orthogonalEdgeStyle') {
//     linkData.points = linkData.points.map(point => {
//       return Number(point)
//     })
//     let points = linkData.points
//     let length = points.length
//     if (
//       linkData.from &&
//       getDataByKey(data.nodeDataArray, linkData.from)
//     ) {
//       const fromPoints = []
//       const nodeData = getDataByKey(
//         data.nodeDataArray,
//         linkData.from
//       )
//       const locationX = go.Point.parse(nodeData.loc).x
//       const locationY = go.Point.parse(nodeData.loc).y
//       const fromW = Number(nodeData.width)
//       const fromH = Number(nodeData.height)
//       const fromX = locationX - fromW / 2
//       const fromY = locationY - fromH / 2
//       const fromXAndWidth = locationX + fromW / 2
//       const fromYAndHeight = locationY + fromH / 2
//       let exitX = linkData.exitX ? Number(linkData.exitX) : null
//       let exitY = linkData.exitY ? Number(linkData.exitY) : null
//       let p1 = points[0]
//       let p2 = points[1]
//       // let p3 = points[2]
//       let p4 = points[3]
//       let disappearX = 0
//       let disappearY = 0
//       if (exitX === null || exitY === null) {
//         if ((fromX > p1 || fromXAndWidth < p1) && (p2 < fromY || p2 > fromYAndHeight)) {
//           disappearX = locationX
//           disappearY = p2
//           if (disappearY === p2 && disappearY === p4) {
//             disappearX = p1
//             disappearY = locationY
//           }
//           p1 = disappearX
//           p2 = disappearY
//         }
//         if ((fromX <= p1 && fromXAndWidth >= p1) || (p2 >= fromY && p2 <= fromYAndHeight)) {
//           if (fromY > p2) {
//             if (fromX <= p1 && fromXAndWidth >= p1) {
//               exitX = (p1 - fromX) / fromW
//               exitY = 0
//             }
//           }
//           if (fromYAndHeight < p2) {
//             if (fromX <= p1 && fromXAndWidth >= p1) {
//               exitX = (p1 - fromX) / fromW
//               exitY = 1
//             }
//           }
//           if (p2 >= fromY && p2 <= fromYAndHeight) {
//             if (fromX <= p1 && fromXAndWidth >= p1) {
//               exitX = (p1 - fromX) / fromW
//               exitY = (p2 - fromY) / fromH
//             }
//           }
//           if (fromX > p1) {
//             if (fromY <= p2 && fromYAndHeight >= p2) {
//               exitX = 0
//               exitY = (p2 - fromY) / fromH
//             }
//           }
//           if (fromXAndWidth < p1) {
//             if (fromY <= p2 && fromYAndHeight >= p2) {
//               exitX = 1
//               exitY = (p2 - fromY) / fromH
//             }
//           }
//           if (p1 >= fromX && p1 <= fromXAndWidth) {
//             if (fromY <= p2 && fromYAndHeight >= p2) {
//               exitX = (p1 - fromX) / fromW
//               exitY = (p2 - fromY) / fromH
//             }
//           }
//         }
//       }
//       let x = fromX + fromW * exitX
//       let y = fromY + fromH * exitY
//       fromPoints.push(x, y)
//       if (disappearX && disappearY) {
//         fromPoints.push(disappearX, disappearY)
//       }
//       linkData.points = fromPoints.concat(linkData.points)
//     }
//     if (
//       linkData.to &&
//       getDataByKey(data.nodeDataArray, linkData.to)
//     ) {
//       const toPoints = []
//       const nodeData = getDataByKey(data.nodeDataArray, linkData.to)
//       const locationX = go.Point.parse(nodeData.loc).x
//       const locationY = go.Point.parse(nodeData.loc).y
//       const fromW = Number(nodeData.width)
//       const fromH = Number(nodeData.height)
//       const fromX = locationX - fromW / 2
//       const fromY = locationY - fromH / 2
//       const fromXAndWidth = locationX + fromW / 2
//       const fromYAndHeight = locationY + fromH / 2
//       let entryX = linkData.entryX ? Number(linkData.entryX) : null
//       let entryY = linkData.entryY ? Number(linkData.entryY) : null
//       let p1 = points[length - 2]
//       let p2 = points[length - 1]
//       // let p3 = points[length - 4]
//       let p4 = points[length - 3]
//       let disappearX = 0
//       let disappearY = 0
//       if (entryX === null || entryY === null) {
//         if ((fromX > p1 || fromXAndWidth < p1) && (p2 < fromY || p2 > fromYAndHeight)) {
//           disappearX = locationX
//           disappearY = p2
//           if (disappearY === p2 && disappearY === p4) {
//             disappearX = p1
//             disappearY = locationY
//           }
//           p1 = disappearX
//           p2 = disappearY
//         }
//         if ((fromX <= p1 && fromXAndWidth >= p1) || (p2 >= fromY && p2 <= fromYAndHeight)) {
//           if (fromY > p2) {
//             if (fromX <= p1 && fromXAndWidth >= p1) {
//               entryX = (p1 - fromX) / fromW
//               entryY = 0
//             }
//           }
//           if (fromYAndHeight < p2) {
//             if (fromX <= p1 && fromXAndWidth >= p1) {
//               entryX = (p1 - fromX) / fromW
//               entryY = 1
//             }
//           }
//           if (p2 >= fromY && p2 <= fromYAndHeight) {
//             if (fromX <= p1 && fromXAndWidth >= p1) {
//               entryX = (p1 - fromX) / fromW
//               entryY = (p2 - fromY) / fromH
//             }
//           }
//           if (fromX > p1) {
//             if (fromY <= p2 && fromYAndHeight >= p2) {
//               entryX = 0
//               entryY = (p2 - fromY) / fromH
//             }
//           }
//           if (fromXAndWidth < p1) {
//             if (fromY <= p2 && fromYAndHeight >= p2) {
//               entryX = 1
//               entryY = (p2 - fromY) / fromH
//             }
//           }
//           if (p1 >= fromX && p1 <= fromXAndWidth) {
//             if (fromY <= p2 && fromYAndHeight >= p2) {
//               entryX = (p1 - fromX) / fromW
//               entryY = (p2 - fromY) / fromH
//             }
//           }
//         }
//       }
//       let x = fromX + fromW * entryX
//       let y = fromY + fromH * entryY
//       if (disappearX && disappearY) {
//         toPoints.push(disappearX, disappearY)
//       }
//       toPoints.push(x, y)
//       linkData.points = linkData.points.concat(toPoints)
//     }
//   }
// }
