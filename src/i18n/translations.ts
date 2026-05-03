export type Language = 'zh' | 'en';

export const translations = {
  en: {
    appName: 'MYML Canvas',

    // TopBar
    save: 'Save',
    new: 'New',
    autoSaved: 'Auto-saved',
    switchToDayMode: 'Switch to Day Mode',
    switchToNightMode: 'Switch to Night Mode',
    doubleClickToRename: 'Double-click to rename',

    // Confirm modal
    unsavedChanges: 'Unsaved Changes',
    unsavedChangesDesc: 'You have unsaved changes. Would you like to save before creating a new canvas?',
    cancel: 'Cancel',
    discard: 'Discard',
    saveAndNew: 'Save & New',
    saving: 'Saving...',

    // Toolbar
    myWorkflows: 'My Workflows',
    assets: 'Assets',
    history: 'History',
    tools: 'Tools',
    importTikTok: 'Import TikTok',
    importTikTokDesc: 'Download without watermark',
    storyboardGenerator: 'Storyboard Generator',
    storyboardGeneratorDesc: 'Create scenes with AI',

    // Context menu
    createAsset: 'Create Asset',
    copy: 'Copy',
    duplicate: 'Duplicate',
    delete: 'Delete',
    upload: 'Upload',
    addAssets: 'Add Assets',
    addNodes: 'Add Nodes',
    undo: 'Undo',
    redo: 'Redo',
    paste: 'Paste',
    generateFromThisNode: 'Generate from this node',

    // Add nodes menu
    textGeneration: 'Text Generation',
    textGenerationDesc: 'Script, ad copy, brand text',
    textNode: 'Text',
    imageGeneration: 'Image Generation',
    imageNode: 'Image',
    imageNodeDesc: 'Promotional image, poster, cover',
    videoGeneration: 'Video Generation',
    videoNode: 'Video',
    imageEditor: 'Image Editor',
    videoEditor: 'Video Editor',
    doubleClickOpenImageEditor: 'Double click to open editor',
    localModels: 'Local Models (Open Source)',
    localImageModel: 'Local Image Model',
    localImageModelDesc: 'Use downloaded open-source models',
    localVideoModel: 'Local Video Model',
    localVideoModelDesc: 'AnimateDiff, SVD, and more',
    newBadge: 'NEW',

    // Workflow panel
    myWorkflowsTab: 'My Workflows',
    publicWorkflows: 'Public Workflows',
    noWorkflowsFound: 'No workflows found',
    noPublicWorkflows: 'No public workflows available',
    addWorkflowJsons: 'Add workflow JSONs to public/workflows/',
    publicBadge: 'PUBLIC',
    untitled: 'Untitled',
    nodes: 'nodes',
    editCover: 'Edit cover',
    selectCoverImage: 'Select Cover Image',
    coverOption: 'Cover option',
    loadingMore: 'Loading more...',
    deleteWorkflow: 'Delete Workflow',
    deleteWorkflowConfirm: 'Are you sure you want to delete this workflow? This action cannot be undone.',
    deleteWorkflowTitle: 'Delete workflow',
    noImagesAvailable: 'No images available. Generate some images first!',

    // Asset library
    all: 'All',
    character: 'Character',
    scene: 'Scene',
    item: 'Item',
    style: 'Style',
    soundEffect: 'Sound Effect',
    others: 'Others',
    noAssetsFound: 'No assets found in this category.',
    deleteAsset: 'Delete Asset',
    deleteAssetConfirm: 'Are you sure you want to delete this asset? This action cannot be undone.',

    // History panel
    imageHistory: 'Image History',
    videoHistory: 'Video History',
    generatedImage: 'Generated image',
    noImagesFound: 'No images found',
    noVideosFound: 'No videos found',
    generatedImagesAppearHere: 'Generated images will appear here',
    generatedVideosAppearHere: 'Generated videos will appear here',

    // Bottom
    zoom: 'Zoom',

    // Selection / Group
    group: 'Group',
    ungroup: 'Ungroup',
    sort: 'Sort',
    sortHorizontal: 'Horizontal',
    sortVertical: 'Vertical',
    sortGrid: 'Grid (3 cols)',
    editStoryboard: 'Edit Storyboard',
    createVideos: 'Create Videos',
    newGroup: 'New Group',

    // Language
    language: 'Language',
    chinese: '中文',
    english: 'English',
  },

  zh: {
    appName: 'MYML Canvas',

    // TopBar
    save: '保存',
    new: '新建',
    autoSaved: '已自动保存',
    switchToDayMode: '切换到日间模式',
    switchToNightMode: '切换到夜间模式',
    doubleClickToRename: '双击重命名',

    // Confirm modal
    unsavedChanges: '未保存的更改',
    unsavedChangesDesc: '当前画布有未保存的更改。是否先保存再创建新画布？',
    cancel: '取消',
    discard: '放弃',
    saveAndNew: '保存并新建',
    saving: '保存中...',

    // Toolbar
    myWorkflows: '我的工作流',
    assets: '素材库',
    history: '历史记录',
    tools: '工具',
    importTikTok: '导入 TikTok',
    importTikTokDesc: '无水印下载',
    storyboardGenerator: '分镜生成器',
    storyboardGeneratorDesc: '用 AI 创建场景',

    // Context menu
    createAsset: '创建素材',
    copy: '复制',
    duplicate: '复制副本',
    delete: '删除',
    upload: '上传',
    addAssets: '添加素材',
    addNodes: '添加节点',
    undo: '撤销',
    redo: '重做',
    paste: '粘贴',
    generateFromThisNode: '从该节点生成',

    // Add nodes menu
    textGeneration: '文本生成',
    textGenerationDesc: '脚本、广告文案、品牌文本',
    textNode: '文本',
    imageGeneration: '图像生成',
    imageNode: '图像',
    imageNodeDesc: '宣传图、海报、封面',
    videoGeneration: '视频生成',
    videoNode: '视频',
    imageEditor: '图像编辑器',
    videoEditor: '视频编辑器',
    doubleClickOpenImageEditor: '双击打开图像编辑器',
    localModels: '本地模型（开源）',
    localImageModel: '本地图像模型',
    localImageModelDesc: '使用已下载的开源模型',
    localVideoModel: '本地视频模型',
    localVideoModelDesc: 'AnimateDiff、SVD 等',
    newBadge: '新',

    // Workflow panel
    myWorkflowsTab: '我的工作流',
    publicWorkflows: '公共工作流',
    noWorkflowsFound: '暂无工作流',
    noPublicWorkflows: '暂无公共工作流',
    addWorkflowJsons: '请将工作流 JSON 添加到 public/workflows/',
    publicBadge: '公共',
    untitled: '未命名',
    nodes: '个节点',
    editCover: '编辑封面',
    selectCoverImage: '选择封面图',
    coverOption: '封面选项',
    loadingMore: '加载更多...',
    deleteWorkflow: '删除工作流',
    deleteWorkflowConfirm: '确定要删除这个工作流吗？此操作无法撤销。',
    deleteWorkflowTitle: '删除工作流',
    noImagesAvailable: '暂无可用图片。请先生成一些图片。',

    // Asset library
    all: '全部',
    character: '角色',
    scene: '场景',
    item: '物品',
    style: '风格',
    soundEffect: '音效',
    others: '其他',
    noAssetsFound: '当前分类下暂无素材。',
    deleteAsset: '删除素材',
    deleteAssetConfirm: '确定要删除这个素材吗？此操作无法撤销。',

    // History panel
    imageHistory: '图像历史',
    videoHistory: '视频历史',
    generatedImage: '生成图像',
    noImagesFound: '暂无图像',
    noVideosFound: '暂无视频',
    generatedImagesAppearHere: '生成的图像会显示在这里',
    generatedVideosAppearHere: '生成的视频会显示在这里',

    // Bottom
    zoom: '缩放',

    // Selection / Group
    group: '分组',
    ungroup: '取消分组',
    sort: '排序',
    sortHorizontal: '水平排列',
    sortVertical: '垂直排列',
    sortGrid: '网格排列（3列）',
    editStoryboard: '编辑分镜',
    createVideos: '创建视频',
    newGroup: '新分组',

    // Language
    language: '语言',
    chinese: '中文',
    english: 'English',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function t(language: Language, key: TranslationKey): string {
  return translations[language][key] || translations.en[key] || key;
}
