import { Load, useLoad } from '../../ui';

export default function MyRoom() {
  const st = useLoad('/student/profile'); const bed = st.data?.bed;
  return (
    <>
      <h1>My Room</h1>
      <Load st={st} what="room details" empty={st.data && !bed && 'No room has been allotted to you yet. Contact the warden.'}>
        {bed && <div className="card"><dl className="kv"><dt>Hostel</dt><dd>{bed.room.block.hostel.name}</dd><dt>Block</dt><dd>{bed.room.block.name}</dd><dt>Floor</dt><dd>{bed.room.floor}</dd>
          <dt>Room</dt><dd>{bed.room.number}</dd><dt>Bed</dt><dd>{bed.label}</dd><dt>Room capacity</dt><dd>{bed.room.capacity} beds</dd></dl>
          <p className="muted">Room and bed changes are made by the warden.</p></div>}
      </Load>
    </>
  );
}
