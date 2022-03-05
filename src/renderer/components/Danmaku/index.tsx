import { ipcRenderer } from 'electron';
import React, {
  FC,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
// import { increment, asyncIncrement } from '../../store/features/counterSlice';
import DanmakuList, { DanmakuListRef } from './DanmakuList/DanmakuList';
import DanmakuGiftList, {
  DanmakuGiftListRef,
} from './DanmakuGiftList/DanmakuGiftList';
import SuperChatPanel, {
  SuperChatPanelRef,
} from './SuperChatPanel/SuperChatPanel';
import GiftBubble, { GiftBubbleRef } from './GiftBubble/GiftBubble';
import { CmdType } from './MsgModel';
import voice from '../../utils/vioce';
import MsgEntity from './MsgEntity/MsgEntity';
import { getLiveRoomInfo, getResentSuperChat, LiveRoom } from '../../api';
import { ConfigKey } from '../../reducers/types';
import { setCssVariable } from '../../utils/common';
import LiveRoomLists from './LiveRoomLists';
import DanmakuControl from './DanmakuControl/DanmakuControl';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectConfig, updateConfig, fetchVersionInfo } from "../../store/features/configSlice";
import { selectDanmaku, createSocket, fetchGiftData } from "../../store/features/danmakuSlice";

const Danmaku: FC = () => {
  const dispatch = useAppDispatch();
  const config = useAppSelector(selectConfig);
  const danmaku = useAppSelector(selectDanmaku);
  const { socket } = danmaku
  // 以shortid房间短号显示
  const [roomID, setRoomID] = useState(config.shortid);
  const [popular, setPopular] = useState(0);
  const [lockMode, setLockMode] = useState(false);
  const danmakuRef = useRef<DanmakuListRef>(null);
  const danmakuGiftList = useRef<DanmakuGiftListRef>(null);
  const scRef = useRef<SuperChatPanelRef>(null);
  const giftRef = useRef<GiftBubbleRef>(null);
  const currentConfig = useRef(config);
  currentConfig.current = config;
  const { t } = useTranslation();

  // onMessage必须使用useRef.current,否则会造成更新不会实时同步
  function onMessage(res: DanmakuDataFormatted[]) {
    // console.log('res====>', res)
    const renderDanmakuLists: React.ReactElement[] = [];
    const renderDanmakuGiftLists: React.ReactElement[] = [];
    if (currentConfig.current.blockScrollBar) return;
    for (let i = 0; i < res.length; i++) {
      const msg = res[i];
      if (msg.cmd === CmdType.POPULAR) {
        setPopular(msg.popular);
        return;
      }
      if (
        msg.cmd === CmdType.NOTICE_MSG &&
        currentConfig.current.blockEffectItem3 === 1
      )
        return;
      if (msg.cmd === CmdType.DANMU_MSG) {
        if (currentConfig.current.showVoice) {
          voice.push(msg.username, msg.content);
        }
      }
      if (currentConfig.current.blockEffectItem4 === 0) {
        if (msg.cmd === CmdType.SEND_GIFT || msg.cmd === CmdType.COMBO_SEND) {
          const giftElement = (
            <MsgEntity
              {...msg}
              showGift
              showTransition={currentConfig.current.showTransition === 1}
              key={String(Math.random())}
            />
          );
          renderDanmakuGiftLists.push(giftElement);
          if (msg.coinType === 'gold') {
            onGiftBubbleMessage(msg);
          }
        }
      }

      // TODO: COMBO_END
      // if (msg.cmd === CmdType.COMBO_END) {
      //   console.log('COMBO_END=======>', msg);
      //   return;
      // }

      if (
        msg.cmd === CmdType.SUPER_CHAT_MESSAGE &&
        currentConfig.current.blockEffectItem3 === 0
      ) {
        onScMessage(msg);
      }
      // 添加到渲染列表
      const renderElement = (
        <MsgEntity
          {...msg}
          showTransition={currentConfig.current.showTransition === 1}
          key={String(Math.random())}
        />
      );
      renderDanmakuLists.push(renderElement);
    }
    onDanmakuMessage(renderDanmakuLists);
    onGiftMessage(renderDanmakuGiftLists);
  }

  async function fetchResentSuperChat(roomid: number) {
    const scLists = await getResentSuperChat(roomid);
    onMessage(scLists);
  }

  const onDanmakuMessage = useCallback((lists: React.ReactElement[]) => {
    danmakuRef?.current?.onMessage && danmakuRef.current.onMessage(lists);
  }, []);

  const handleClearMessage = useCallback(() => {
    danmakuRef?.current?.clearMessage && danmakuRef.current.clearMessage();
  }, []);

  const onGiftMessage = useCallback((lists: React.ReactElement[]) => {
    danmakuGiftList?.current?.onMessage &&
      danmakuGiftList.current.onMessage(lists);
  }, []);

  const onScMessage = useCallback((msg: SUPER_CHAT_MESSAGE) => {
    scRef?.current?.onMessage && scRef.current.onMessage(msg.data);
  }, []);

  const clearSCMessage = useCallback(() => {
    scRef?.current?.onClearMessage && scRef.current.onClearMessage();
  }, []);

  const onGiftBubbleMessage = useCallback((msg: GiftBubbleMsg) => {
    giftRef?.current?.onMessage && giftRef.current.onMessage(msg);
  }, []);

  const handleDispatchUpDateConfig = (state) => {
    dispatch(updateConfig(state))
  }

  const handleSubmit = async (
    e?: FormEvent | null,
    selectedShortId?: number
  ) => {
    if (e) {
      e.preventDefault();
    }
    let roomData: LiveRoom;
    if (selectedShortId) {
      roomData = await getLiveRoomInfo(selectedShortId);
    } else {
      roomData = await getLiveRoomInfo(roomID);
    }

    // 创建新的socket
    dispatch(createSocket(roomData.roomid));
    setRoomID(roomData.shortid);
    // 更新config
    handleDispatchUpDateConfig({ k: ConfigKey.shortid, v: roomData.shortid });
    handleDispatchUpDateConfig({ k: ConfigKey.roomid, v: roomData.roomid });
    // 清空SC
    clearSCMessage();
    // 清空旧消息
    handleClearMessage();
    onConnecting();
  };

  const handleLock = () => {
    setLockMode(!lockMode);
    handleDispatchUpDateConfig({ k: ConfigKey.setAlwaysOnTop, v: lockMode ? 1 : 0 });
    ipcRenderer.send('setAlwaysOnTop', !lockMode);
  };

  const onConnecting = () => {
    const danmakuData = {
      cmd: CmdType.CONNECTING,
    };
    onMessage([danmakuData]);
  };

  function initCssVariable() {
    const cssVariables = [
      { k: ConfigKey.avatarSize, v: `${config.avatarSize}px` },
      { k: ConfigKey.fontSize, v: `${config.fontSize}px` },
      { k: ConfigKey.fontFamily, v: `${config.fontFamily}` },
      { k: ConfigKey.fontLineHeight, v: `${config.fontLineHeight}px` },
      { k: ConfigKey.fontMarginTop, v: `${config.fontMarginTop}px` },
      {
        k: ConfigKey.backgroundColor,
        v:
          config.backgroundColor === 0
            ? `rgba(255,255,255, ${config.backgroundOpacity})`
            : `rgba(0,0,0, ${config.backgroundOpacity})`,
      },
    ];
    cssVariables.forEach((item) => {
      setCssVariable(item.k, item.v);
    });
  }

  useEffect(() => {
    if (socket._methods.length === 0) {
      socket.init();
      socket.addMethods([onMessage]);
      onConnecting();
      initCssVariable();
      dispatch(fetchGiftData());
      fetchResentSuperChat(roomID);
      dispatch(fetchVersionInfo());
    }
  });

  return (
    <div className="danmakuContainer">
      <div className="liveConfig">
        <span className="liveInfoBar">RoomID:</span>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            onChange={(e) => setRoomID(Number(e.target.value))}
            value={roomID}
            className="link-input config-input v-middle border-box level-input"
            style={{ width: 80 }}
          />
          <input type="submit" className="hidden" value="Save" />
        </form>
        <div className="liveInfoBar row" />
        <div className="liveIconContainer">
          <LiveRoomLists onChangeRoomID={handleSubmit} />
          <span
            title={t('HeaderLockTitle')}
            onClick={handleLock}
            className={`icon-item icon-font liveIcon pointer ${
              lockMode ? 'icon-lock active' : 'icon-unlock'
            }`}
            style={{ fontSize: 17 }}
          />
          <span
            title={t('HeaderCloseTitle')}
            onClick={() => ipcRenderer.send('closeApp')}
            className="icon-item icon-font icon-error error liveIcon pointer"
          />
        </div>
      </div>
      <SuperChatPanel ref={scRef} />
      <GiftBubble ref={giftRef} />
      <div className="danmakuWrap">
        <DanmakuList
          ref={danmakuRef}
          showGiftDanmakuList={currentConfig.current.showGiftDanmakuList === 1}
          height={config.danmakuGiftListHeight}
          maxMessageCount={currentConfig.current.maxMessageCount}
        />
        <DanmakuGiftList
          ref={danmakuGiftList}
          showGiftDanmakuList={currentConfig.current.showGiftDanmakuList === 1}
          height={currentConfig.current.danmakuGiftListHeight}
          maxGiftCount={currentConfig.current.maxDanmakuGiftCount}
          updateConfig={handleDispatchUpDateConfig}
        />
      </div>
      <DanmakuControl
        popular={popular}
        onMessage={onMessage}
        clearMessage={handleClearMessage}
        clearSCMessage={clearSCMessage}
      />
    </div>
  );
};

export default Danmaku;
