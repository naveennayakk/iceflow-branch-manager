import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import SubEmployeesBoard from './sub/SubEmployeesBoard';

interface Branch {
  id: string;
  name: string;
  code: string;
  isMain?: boolean;
}

export default function EmployeesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [params, setParams] = useSearchParams();
  const selected = params.get('branchId') || '';

  useEffect(() => {
    void api.get('/branches').then((r) => {
      const list = (r.data.data as Branch[]).filter((b) => !b.isMain);
      setBranches(list);
      if (!params.get('branchId') && list[0]) {
        setParams({ branchId: list[0].id }, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ice-700">Branch</p>
        {selected && (
          <Link to={`/main/workspace/${selected}/employees`} className="text-xs font-semibold text-ice-700 hover:underline">
            Open full workspace →
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {branches.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setParams({ branchId: b.id })}
            className={
              selected === b.id
                ? 'rounded-xl bg-ice-800 px-4 py-2 text-sm font-semibold text-white'
                : 'rounded-xl border border-ice-100 bg-white px-4 py-2 text-sm font-medium text-ice-800 hover:bg-ice-50'
            }
          >
            {b.name}
          </button>
        ))}
      </div>
      {selected ? <SubEmployeesBoard /> : <div className="text-ice-600">Select a branch</div>}
    </div>
  );
}
