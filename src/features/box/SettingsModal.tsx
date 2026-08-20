import { useState } from 'react';
import type { PaperId, TypeId } from '../../design/colors';
import { useStore } from '../../lib/storeContext';
import { toUserMessage } from '../../lib/errors';
import type { Box } from '../../lib/types';
import { PaperChoices, TypeChoices } from './ColorChoices';
import { Modal } from '../../app/Modal';

interface Props { box: Box; displayName: string; onClose: () => void; onSaved: () => void }

export function SettingsModal({ box, displayName, onClose, onSaved }: Props) {
  const store = useStore();
  const [name, setName] = useState(displayName);
  const [paper, setPaper] = useState<PaperId>(box.myPaper);
  const [type, setType] = useState<TypeId>(box.myType);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 다른 참여자가 쓰고 있는 색은 고를 수 없다. 겹치면 발신인을 색으로 못 읽는다.
  const taken = box.members.filter((m) => !m.isMe).map((m) => m.paper);

  const save = async () => {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      if (name.trim() && name.trim() !== displayName) await store.updateDisplayName(name);
      await store.setMyColors(box.id, { paper, type });
      onSaved();
      onClose();
    } catch (e) { setError(toUserMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="내 색 · 이름" onClose={onClose}>
      <p className="modal-sub">‘{box.name}’ 전보함에서 쓰는 설정입니다.</p>

      <div className="onb-panel">
        <div className="onb-field">
          <div className="onb-field-label">
            내 이름 <span className="onb-tag">모든 전보함 공통</span>
          </div>
          <input className="onb-input" type="text" value={name} maxLength={12}
            placeholder="표시 이름" onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="onb-field">
          <div className="onb-field-label">내 전보 용지 색</div>
          <p className="onb-hint">내가 보내는 전보의 색입니다. 이미 쓰이는 색은 고를 수 없습니다.</p>
          <PaperChoices value={paper} onChange={setPaper} taken={taken} />
        </div>

        <div className="onb-field">
          <div className="onb-field-label">내 타자기 색</div>
          <p className="onb-hint">어느 전보함에 있는지 구분하는 색입니다. 나만 봅니다.</p>
          <TypeChoices value={type} onChange={setType} />
        </div>

        {error && <p className="onb-error" role="alert">{error}</p>}

        <div className="modal-btns">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="onb-primary" onClick={() => void save()} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
